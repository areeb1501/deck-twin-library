#!/usr/bin/env bash
# Azure deploy wizard for the streaming/ stack (Kafka -> Flink -> ClickHouse).
#
# Two modes: this exact Docker stack on an Azure VM, or the same pipeline shape
# on Event Hubs / Container Apps / Flexible Server. Both put everything into one
# resource group so teardown.sh is a single `az group delete`.
#
# --dry-run prints every az command instead of running it. There is no Azure
# control-plane emulator to test against (Azurite emulates Storage only, not
# compute or networking), so --dry-run is the local test path.
set -euo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
. "$HERE/../lib/common.sh"
REPO_ROOT=$(cd "$HERE/../.." && pwd)

DRY_RUN=no
ADMIN_USER=plant            # must match cloud-init.yaml's __ADMIN_USER__ slot
VNET_CIDR=10.61.0.0/16
IMAGE_URN="Canonical:ubuntu-24_04-lts:server:latest"

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=yes ;;
    -h|--help) printf 'usage: %s [--dry-run]\n' "$0"; exit 0 ;;
    *) die "unknown flag '$arg' (try --help)" ;;
  esac
done

# ---- execution wrappers ----------------------------------------------------
run() {
  if [ "$DRY_RUN" = yes ]; then
    printf '  %s$ %s%s\n' "$C_DIM" "$*" "$C_RST"
    return 0
  fi
  "$@"
}

# Same, but captures stdout. Dry-run has no resource to query, so it emits the
# placeholder so downstream formatting (IPs in tunnel commands) still renders.
run_out() {
  local placeholder=$1; shift
  if [ "$DRY_RUN" = yes ]; then
    printf '  %s$ %s%s\n' "$C_DIM" "$*" "$C_RST" >&2
    printf '%s' "$placeholder"
    return 0
  fi
  "$@"
}

PLAN_TOTAL=0
plan_cost() {  # plan_cost "<description>" <usd_per_month>
  PLAN_TOTAL=$((PLAN_TOTAL + $2))
  plan_add "$(printf '%-56s ~$%s/mo' "$1" "$2")"
}

# Storage account names are 3-24 chars, lowercase alphanumeric, NO hyphens --
# the one Azure name that breaks the pattern every other resource follows.
sanitize_sa() {
  printf '%s' "$1" | tr 'A-Z' 'a-z' | tr -cd 'a-z0-9' | cut -c1-24
}

# ---- phase 1: preflight ----------------------------------------------------
preflight() {
  banner "Azure deploy wizard — streaming stack"
  require_cli az "brew install azure-cli"
  if [ "$DRY_RUN" = yes ]; then
    warn "--dry-run: no subscription check, no resources created"
  else
    az account show >/dev/null 2>&1 || die "not logged in — run 'az login'"
    ok "subscription: $(az account show --query name -o tsv)"
  fi
}

# ---- phase 2: preferences --------------------------------------------------
collect_prefs() {
  ask NAME "Deployment name" "plant-stream"
  validate_name "$NAME"
  RG="rg-$NAME"
  STATE_DIR="$HERE/state/$NAME"

  ask_choice REGION "Azure region" \
    eastus westus2 westeurope northeurope centralindia southeastasia

  ask EPS "Estimated events/second" "100"
  TIER=$(size_for_eps "$EPS")
  PARTITIONS=$(partitions_for_tier "$TIER")
  case "$TIER" in
    small)  VM_SIZE=Standard_B2ms;  VM_COST=61;  DISK_GB=64;  DISK_COST=10 ;;
    medium) VM_SIZE=Standard_D4s_v5; VM_COST=140; DISK_GB=128; DISK_COST=19 ;;
    large)  VM_SIZE=Standard_D8s_v5; VM_COST=280; DISK_GB=256; DISK_COST=38 ;;
  esac
  info "$EPS ev/s -> tier $C_BOLD$TIER$C_RST -> $VM_SIZE, ${DISK_GB}G Premium SSD, $PARTITIONS partitions/topic"

  ask_choice MODE "How should this run?" \
    "Fully self-hosted (this exact Docker stack on an Azure VM)" \
    "Managed services (Event Hubs, Container Apps, Flexible Postgres)"

  CALLER_IP=$(my_ip)
  SSH_SRC=Internet
  [ -n "$CALLER_IP" ] || warn "could not detect your public IP — SSH would be left open to the internet"
}

collect_self_hosted() {
  ask_choice VM_COUNT_C "How many VMs?" \
    "1  — everything on one box (the reference layout)" \
    "3  — Kafka RF 3; brokers on all three, Flink+apps on vm1, ClickHouse+dashboards on vm2"
  if [ "$VM_COUNT_C_IDX" = 2 ]; then VM_COUNT=3; RF=3; else VM_COUNT=1; RF=1; fi

  ask DISK_GB "Managed disk per VM (GB, Premium SSD)" "$DISK_GB"
  DISK_COST=$((DISK_GB * 15 / 100))     # Premium SSD is ~$0.15/GB-month

  ask_yesno LOCK_SSH "Restrict SSH to your current IP ($CALLER_IP)" y
  if [ "$LOCK_SSH" = yes ] && [ -n "$CALLER_IP" ]; then SSH_SRC="$CALLER_IP/32"; fi

  local sa_default
  sa_default=$(sanitize_sa "${NAME}artifacts")
  while true; do
    ask SA_NAME "Storage account for the compose bundle + backups" "$sa_default"
    SA_NAME=$(sanitize_sa "$SA_NAME")
    [ ${#SA_NAME} -ge 3 ] && break
    warn "storage account names are 3-24 lowercase alphanumeric characters, no hyphens"
  done
}

collect_managed() {
  ask_secret CH_KEY "ClickHouse Cloud API key"
  if [ -n "$CH_KEY" ]; then
    CH_MODE=cloud
  else
    CH_MODE=vm
    warn "no ClickHouse Cloud key — falling back to ClickHouse on a $VM_SIZE VM in the vnet"
  fi

  ask_choice CONSUMERS "How should the consumer services run?" \
    "Container Apps (the containers as-is)" \
    "Azure Functions (sketch only — not implemented)"
  [ "$CONSUMERS_IDX" = 2 ] && die "the Functions path would require rewriting five long-lived Kafka consumers as triggers — out of scope; re-run and pick Container Apps"

  case "$TIER" in
    small)  PG_SKU=Standard_B1ms; PG_COST=13; EH_TU=1 ;;
    medium) PG_SKU=Standard_B2ms; PG_COST=26; EH_TU=2 ;;
    large)  PG_SKU=Standard_B2ms; PG_COST=26; EH_TU=4 ;;
  esac
  # Nothing in this mode is meant to be SSH'd into except the ClickHouse
  # fallback VM, so there is no prompt — it is locked to the caller or absent.
  if [ -n "$CALLER_IP" ]; then SSH_SRC="$CALLER_IP/32"; fi

  ACR_NAME=$(sanitize_sa "${NAME}acr")
  KV_NAME="kv-$(printf '%s' "$NAME" | cut -c1-18)"
  EH_NS="ehns-$NAME"
  # Standard tier caps an event hub at 32 partitions; the tier map never
  # exceeds 12, but clamp so a hand-edited partitions_for_tier cannot fail late.
  if [ "$PARTITIONS" -gt 32 ]; then PARTITIONS=32; fi
}

# ---- phase 3: the plan -----------------------------------------------------
plan_common() {
  plan_add "resource group $RG in $REGION, tagged deployment=$NAME"
  plan_add "vnet $VNET_CIDR — subnets: frontend 10.61.1.0/24, apps 10.61.2.0/23, data 10.61.4.0/24"
  plan_add "NSG: 80/443 from Internet, 22 from $SSH_SRC, service ports intra-vnet only"
  plan_add "10 Kafka topics x $PARTITIONS partitions (tier $TIER, $EPS ev/s)"
}

plan_self_hosted() {
  plan_common
  plan_cost "$VM_COUNT x $VM_SIZE VM (Ubuntu 24.04, cloud-init Docker)" $((VM_COST * VM_COUNT))
  plan_cost "$VM_COUNT x ${DISK_GB}G Premium SSD managed disk" $((DISK_COST * VM_COUNT))
  plan_cost "1 x standard static public IP (Caddy, ports 80/443)" 4
  plan_cost "storage account $SA_NAME (Standard_LRS, bundle + backups)" 3
  plan_add "Kafka replication factor $RF; topics created over SSH once compose is up"
  if [ "$VM_COUNT" = 3 ]; then
    plan_add "role split — vm1: broker+Flink+apps, vm2: broker+ClickHouse+dashboards, vm3: broker"
    plan_add "each VM gets a generated compose override with its own node id and advertised listener"
    plan_add "CAVEAT: Caddy runs on vm1 but proxies dashboard/grafana by container"
    plan_add "  name, which is single-host DNS. Repoint those upstreams at vm2's"
    plan_add "  private IP in streaming/caddy/Caddyfile — the wizard does not."
  fi
  plan_add "SSH key generated into state/$NAME/ (chmod 400) — not added to ~/.ssh"
  plan_add "secrets: generated into a chmod-600 .env on the VM, never prompted"
}

plan_managed() {
  plan_common
  plan_cost "Event Hubs namespace $EH_NS — Standard, $EH_TU TU, Kafka surface on" $((22 * EH_TU))
  plan_add "  Kafka protocol requires Standard or above; Basic has no Kafka endpoint"
  plan_add "  10 event hubs (one per topic), $PARTITIONS partitions each, 7-day retention"
  plan_add "Container Apps env, VNet-injected into the apps subnet, internal ingress"
  plan_cost "  Flink jobmanager + taskmanager as container apps" 70
  plan_add "  Azure has NO first-party managed Flink — HDInsight on AKS is retired."
  plan_add "  Flink runs as ordinary containers here; you own restarts and savepoints."
  plan_cost "  5 consumer apps (risk-engine, redrive, notifier, ingest, dashboard)" 60
  plan_cost "ACR $ACR_NAME (Basic) + az acr build for 6 images" 5
  plan_cost "PostgreSQL Flexible Server $PG_SKU, private access, 32G" "$PG_COST"
  if [ "$CH_MODE" = cloud ]; then
    plan_add "ClickHouse Cloud (your API key; billed by ClickHouse, not Azure)"
  else
    plan_cost "ClickHouse on a $VM_SIZE VM in the data subnet" $((VM_COST + DISK_COST))
  fi
  plan_cost "Azure Managed Grafana (Standard)" 49
  plan_cost "Key Vault $KV_NAME (RBAC-enabled) — all secrets, referenced by app" 1
}

# ---- phase 4: networking (both modes) --------------------------------------
deploy_network() {
  info "resource group + network"
  run az group create -n "$RG" -l "$REGION" --tags "deployment=$NAME"
  run az network vnet create -g "$RG" -n "vnet-$NAME" --address-prefix "$VNET_CIDR" \
    --subnet-name frontend --subnet-prefix 10.61.1.0/24
  # /23 is the Container Apps minimum; sized the same in both modes so the two
  # layouts stay swappable without renumbering.
  run az network vnet subnet create -g "$RG" --vnet-name "vnet-$NAME" -n apps --address-prefix 10.61.2.0/23
  run az network vnet subnet create -g "$RG" --vnet-name "vnet-$NAME" -n data --address-prefix 10.61.4.0/24

  run az network nsg create -g "$RG" -n "nsg-$NAME"
  run az network nsg rule create -g "$RG" --nsg-name "nsg-$NAME" -n allow-http \
    --priority 100 --access Allow --protocol Tcp --destination-port-ranges 80 443 --source-address-prefixes Internet
  if [ "$SSH_SRC" = Internet ]; then warn "SSH will be open to the whole internet"; fi
  run az network nsg rule create -g "$RG" --nsg-name "nsg-$NAME" -n allow-ssh \
    --priority 110 --access Allow --protocol Tcp --destination-port-ranges 22 --source-address-prefixes "$SSH_SRC"
  # Kafka/ClickHouse/Postgres/Flink talk to each other only. Azure's built-in
  # DenyAllInBound already blocks the rest; this is the explicit allow it needs.
  run az network nsg rule create -g "$RG" --nsg-name "nsg-$NAME" -n allow-intra-vnet \
    --priority 200 --access Allow --protocol Tcp --source-address-prefixes VirtualNetwork \
    --destination-port-ranges 9092 9093 8123 9000 5432 6123 8081 3000
  ok "network ready"
}

# ---- phase 5a: self-hosted -------------------------------------------------
vm_role_services() {  # which compose services run on which VM
  case "$1" in
    1) echo "kafka flink-jobmanager flink-taskmanager plant-simulator plant-risk-engine plant-dlq-redrive plant-alert-notifier plant-ingest caddy" ;;
    2) echo "kafka kafka-ui clickhouse plant-postgres plant-dashboard grafana" ;;
    3) echo "kafka" ;;
  esac
}

deploy_self_hosted() {
  deploy_network
  mkdir -p "$STATE_DIR"
  chmod 700 "$STATE_DIR"
  local key="$STATE_DIR/id_ed25519"
  if [ ! -f "$key" ] && [ "$DRY_RUN" = no ]; then
    ssh-keygen -t ed25519 -N '' -C "$NAME@azure" -f "$key" >/dev/null
    chmod 400 "$key"
  fi
  # cloud-init has no templating of its own; render the admin user in.
  sed "s/__ADMIN_USER__/$ADMIN_USER/g" "$HERE/cloud-init.yaml" >"$STATE_DIR/cloud-init.rendered.yaml"

  run az storage account create -g "$RG" -n "$SA_NAME" -l "$REGION" \
    --sku Standard_LRS --min-tls-version TLS1_2 --allow-blob-public-access false

  local i ip privs=""
  for i in $(seq 1 "$VM_COUNT"); do
    info "creating vm$i"
    # Only vm1 is reachable from outside; vm2/vm3 are jumped to through it.
    # An indexed array, not a string: `--public-ip-address ""` needs a real
    # empty argument, which word splitting cannot produce.
    local pubip
    if [ "$i" = 1 ]; then pubip=(--public-ip-sku Standard); else pubip=(--public-ip-address ""); fi
    run az vm create -g "$RG" -n "vm$i-$NAME" --image "$IMAGE_URN" --size "$VM_SIZE" \
      --admin-username "$ADMIN_USER" --ssh-key-values "$key.pub" \
      --vnet-name "vnet-$NAME" --subnet frontend --nsg "nsg-$NAME" \
      --os-disk-size-gb "$DISK_GB" --storage-sku Premium_LRS \
      --custom-data "$STATE_DIR/cloud-init.rendered.yaml" \
      "${pubip[@]}" --tags "deployment=$NAME" "role=vm$i"
    privs="$privs $(run_out "10.61.1.$((3 + i))" az vm show -g "$RG" -n "vm$i-$NAME" -d --query privateIps -o tsv)"
  done
  PUBLIC_IP=$(run_out "203.0.113.10" az vm show -g "$RG" -n "vm1-$NAME" -d --query publicIps -o tsv)
  VM_PRIVATE_IPS=${privs# }
  # Kafka UI / ClickHouse / Grafana sit on vm2 in the split layout, so the
  # tunnel and Caddy both have to address them by private IP instead of loopback.
  VM2_HOST=127.0.0.1
  if [ "$VM_COUNT" = 3 ]; then VM2_HOST=$(printf '%s\n' $VM_PRIVATE_IPS | sed -n 2p); fi

  info "packaging streaming/ and uploading"
  local bundle="$STATE_DIR/streaming.tgz"
  run tar -czf "$bundle" -C "$REPO_ROOT" --exclude '.env' streaming
  write_stack_env "$STATE_DIR/stack.env" "$EPS"

  i=1
  for ip in $(printf '%s\n' $VM_PRIVATE_IPS); do
    local host="$ADMIN_USER@$PUBLIC_IP"
    local sshopt="-i $key -o StrictHostKeyChecking=accept-new"
    # vm2/vm3 have no public IP: reach them through vm1 as a jump host.
    if [ "$i" -gt 1 ]; then
      sshopt="$sshopt -o ProxyJump=$ADMIN_USER@$PUBLIC_IP"
      host="$ADMIN_USER@$ip"
    fi

    info "vm$i — waiting for cloud-init, then uploading"
    run ssh $sshopt "$host" \
      "until [ -f /var/lib/cloud/streaming-ready ]; do sleep 10; done"
    run scp $sshopt "$bundle" "$STATE_DIR/stack.env" "$host:/opt/streaming/"
    run ssh $sshopt "$host" "cd /opt/streaming && tar -xzf streaming.tgz --strip-components=1 && mv -f stack.env .env && chmod 600 .env"

    if [ "$VM_COUNT" = 3 ]; then
      # compose hardcodes a single-broker KRaft config; each VM needs its own
      # node id, the full quorum, and an advertised listener on its private IP.
      run ssh $sshopt "$host" "cat >/opt/streaming/docker-compose.multivm.yml" <<EOF
services:
  kafka:
    environment:
      KAFKA_NODE_ID: $i
      KAFKA_CONTROLLER_QUORUM_VOTERS: "$(quorum_voters)"
      KAFKA_ADVERTISED_LISTENERS: "INTERNAL://$ip:9092,EXTERNAL://127.0.0.1:29092"
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: $RF
      KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR: $RF
      KAFKA_TRANSACTION_STATE_LOG_MIN_ISR: 2
EOF
      run ssh $sshopt "$host" "cd /opt/streaming && docker compose -f docker-compose.yml -f docker-compose.multivm.yml --profile plantrisk up -d --build $(vm_role_services "$i")"
    else
      run ssh $sshopt "$host" "cd /opt/streaming && docker compose --profile plantrisk up -d --build"
    fi
    i=$((i + 1))
  done

  create_topics_self_hosted "$key"
  cat >"$STATE_DIR/state.env" <<EOF
NAME=$NAME
RESOURCE_GROUP=$RG
REGION=$REGION
MODE=self-hosted
VM_COUNT=$VM_COUNT
STORAGE_ACCOUNT=$SA_NAME
PUBLIC_IP=$PUBLIC_IP
ADMIN_USER=$ADMIN_USER
EOF
  ok "wrote $STATE_DIR/state.env — teardown.sh reads it"
}

quorum_voters() {  # "1@ip1:9093,2@ip2:9093,3@ip3:9093"
  local n=1 v="" ip
  for ip in $(printf '%s\n' $VM_PRIVATE_IPS); do
    v="$v,$n@$ip:9093"; n=$((n + 1))
  done
  printf '%s' "${v#,}"
}

create_topics_self_hosted() {
  local key=$1 t
  info "creating $PARTITIONS-partition topics (RF $RF)"
  for t in $TOPICS; do
    run ssh -i "$key" -o StrictHostKeyChecking=accept-new "$ADMIN_USER@$PUBLIC_IP" \
      "docker exec kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --create --if-not-exists --topic $t --partitions $PARTITIONS --replication-factor $RF"
  done
  ok "topics created"
}

# ---- phase 5b: managed -----------------------------------------------------
deploy_managed() {
  deploy_network
  mkdir -p "$STATE_DIR"; chmod 700 "$STATE_DIR"

  info "Key Vault (RBAC authorization — access policies are the legacy model)"
  run az keyvault create -g "$RG" -n "$KV_NAME" -l "$REGION" --enable-rbac-authorization true
  local s
  for s in PLANT_PG_PASSWORD CLICKHOUSE_VIEWER_PASSWORD GRAFANA_ADMIN_PASSWORD INGEST_API_KEY; do
    run az keyvault secret set --vault-name "$KV_NAME" -n "$s" --value "$(gen_password)"
  done
  if [ -n "$CH_KEY" ]; then
    run az keyvault secret set --vault-name "$KV_NAME" -n CLICKHOUSE_CLOUD_API_KEY --value "$CH_KEY"
  fi

  info "Event Hubs (Kafka surface)"
  run az eventhubs namespace create -g "$RG" -n "$EH_NS" -l "$REGION" \
    --sku Standard --capacity "$EH_TU" --enable-kafka true
  create_topics_managed

  info "PostgreSQL Flexible Server (private access — no public endpoint)"
  run az postgres flexible-server create -g "$RG" -n "pg-$NAME" -l "$REGION" \
    --tier Burstable --sku-name "$PG_SKU" --version 16 --storage-size 32 \
    --admin-user plant --admin-password "$(gen_password)" \
    --vnet "vnet-$NAME" --subnet data --yes

  info "ACR + image builds"
  run az acr create -g "$RG" -n "$ACR_NAME" --sku Basic --admin-enabled true
  local img
  for img in "streaming-flink:streaming/flink" "plant-risk-engine:streaming/plant-risk/risk-engine" \
             "plant-dlq-redrive:streaming/plant-risk/redrive" "plant-alert-notifier:streaming/plant-risk/notifier" \
             "plant-ingest:streaming/plant-risk/ingest" "plant-dashboard:streaming/dashboard"; do
    run az acr build -r "$ACR_NAME" -t "${img%%:*}:1" "$REPO_ROOT/${img#*:}"
  done

  info "Container Apps environment (internal ingress only)"
  local subnet_id
  subnet_id=$(run_out "/subscriptions/DRY/resourceGroups/$RG/providers/Microsoft.Network/virtualNetworks/vnet-$NAME/subnets/apps" \
    az network vnet subnet show -g "$RG" --vnet-name "vnet-$NAME" -n apps --query id -o tsv)
  run az containerapp env create -g "$RG" -n "cae-$NAME" -l "$REGION" \
    --infrastructure-subnet-resource-id "$subnet_id" --internal-only true

  # Flink as two plain container apps. This is the honest shape of Flink on
  # Azure today: no first-party managed service exists to point at.
  local app
  for app in "flink-jobmanager:jobmanager" "flink-taskmanager:taskmanager"; do
    run az containerapp create -g "$RG" -n "${app%%:*}" --environment "cae-$NAME" \
      --image "$ACR_NAME.azurecr.io/streaming-flink:1" --registry-server "$ACR_NAME.azurecr.io" \
      --args "${app#*:}" --cpu 2 --memory 4Gi --min-replicas 1
  done
  for app in plant-risk-engine plant-dlq-redrive plant-alert-notifier plant-ingest plant-dashboard; do
    # Secrets are Key Vault references, so rotating in the vault rotates here.
    run az containerapp create -g "$RG" -n "$app" --environment "cae-$NAME" \
      --image "$ACR_NAME.azurecr.io/$app:1" --registry-server "$ACR_NAME.azurecr.io" \
      --system-assigned \
      --secrets "chpw=keyvaultref:https://$KV_NAME.vault.azure.net/secrets/CLICKHOUSE_VIEWER_PASSWORD,identityref:system" \
      --env-vars "KAFKA_BOOTSTRAP=$EH_NS.servicebus.windows.net:9093" "CLICKHOUSE_VIEWER_PASSWORD=secretref:chpw" \
      --cpu 0.5 --memory 1Gi --min-replicas 1
  done

  if [ "$CH_MODE" = vm ]; then
    info "ClickHouse fallback VM (no ClickHouse Cloud key given)"
    run az vm create -g "$RG" -n "vm-clickhouse-$NAME" --image "$IMAGE_URN" --size "$VM_SIZE" \
      --admin-username "$ADMIN_USER" --generate-ssh-keys --vnet-name "vnet-$NAME" --subnet data \
      --nsg "nsg-$NAME" --public-ip-address "" --tags "deployment=$NAME"
  fi

  run az grafana create -g "$RG" -n "amg-$NAME" -l "$REGION"

  cat >"$STATE_DIR/state.env" <<EOF
NAME=$NAME
RESOURCE_GROUP=$RG
REGION=$REGION
MODE=managed
EVENTHUBS_NAMESPACE=$EH_NS
KEY_VAULT=$KV_NAME
ACR=$ACR_NAME
CLICKHOUSE=$CH_MODE
EOF
  ok "wrote $STATE_DIR/state.env — teardown.sh reads it"
}

create_topics_managed() {
  local t
  info "creating 10 event hubs (Event Hubs' 'topic' is an event hub)"
  for t in $TOPICS; do
    # Dots are legal in event hub names, so the topic names carry over verbatim
    # and Kafka clients address them unchanged.
    run az eventhubs eventhub create -g "$RG" --namespace-name "$EH_NS" -n "$t" \
      --partition-count "$PARTITIONS" --cleanup-policy Delete --retention-time-in-hours 168
  done
  ok "event hubs created"
}

# ---- phase 6: summary ------------------------------------------------------
summary() {
  banner "Deployed — $NAME"
  if [ "$MODE_IDX" = 1 ]; then
    printf '  Public (Caddy, TLS via sslip.io):\n'
    printf '    https://dash.%s.sslip.io      Streamlit dashboard\n' "$(printf '%s' "$PUBLIC_IP" | tr . -)"
    printf '    https://grafana.%s.sslip.io   Grafana\n' "$(printf '%s' "$PUBLIC_IP" | tr . -)"
    printf '    https://ingest.%s.sslip.io    ingest API (X-API-Key from .env)\n\n' "$(printf '%s' "$PUBLIC_IP" | tr . -)"
    printf '  Everything else stays on 127.0.0.1. Tunnel from your laptop:\n\n'
    printf '    ssh -i %s -N \\\n' "$STATE_DIR/id_ed25519"
    printf '      -L 8081:%s:8081 \\\n      -L 8082:127.0.0.1:8082 \\\n' "$VM2_HOST"
    printf '      -L 8123:%s:8123 \\\n      -L 29092:127.0.0.1:29092 \\\n' "$VM2_HOST"
    printf '      %s@%s\n\n' "$ADMIN_USER" "$PUBLIC_IP"
    printf '    8081 Kafka UI | 8082 Flink | 8123 ClickHouse HTTP | 29092 Kafka\n'
    if [ "$VM_COUNT" = 3 ]; then
      # ssh -L forwards from vm1, so vm2's services are addressed by its private
      # IP rather than loopback -- the split-role layout moved them off vm1.
      printf '    (8081/8123 resolve on vm2 %s; the hop is vm1 either way)\n' "$VM2_HOST"
    fi
    printf '\n'
    printf '  Secrets: /opt/streaming/.env on vm1 (chmod 600); local copy at\n    %s\n' "$STATE_DIR/stack.env"
    printf '  SSH key: %s (chmod 400, not in ~/.ssh)\n\n' "$STATE_DIR/id_ed25519"
    printf '  Next: point a real DNS name at %s and edit streaming/caddy/Caddyfile.\n' "$PUBLIC_IP"
    if [ "$VM_COUNT" = 3 ]; then
      printf '  Also required: Caddy on vm1 resolves upstreams by container name, which\n'
      printf '  is single-host. Repoint dashboard/grafana at %s in the Caddyfile.\n' "$VM2_HOST"
    fi
  else
    printf '  Kafka bootstrap: %s.servicebus.windows.net:9093 (SASL_SSL, $ConnectionString)\n' "$EH_NS"
    printf '  Postgres:        pg-%s.postgres.database.azure.com (private, vnet only)\n' "$NAME"
    printf '  ClickHouse:      %s\n' "$([ "$CH_MODE" = cloud ] && echo 'ClickHouse Cloud (your account)' || echo "vm-clickhouse-$NAME in the data subnet")"
    printf '  Grafana:         az grafana show -g %s -n amg-%s --query properties.endpoint -o tsv\n' "$RG" "$NAME"
    printf '  Container Apps:  internal ingress only — reach them from inside the vnet\n\n'
    printf '  Secrets: Key Vault %s (RBAC). Apps read them as secret refs, so\n' "$KV_NAME"
    printf '  rotating a vault secret rotates the app without a redeploy.\n\n'
    printf '  Next: grant each app'\''s managed identity "Key Vault Secrets User" on %s,\n' "$KV_NAME"
    printf '  and submit the Flink job to flink-jobmanager from inside the vnet.\n'
  fi
  printf '\n  Teardown: bash %s/teardown.sh %s\n\n' "$HERE" "$NAME"
}

# ---- main ------------------------------------------------------------------
preflight
collect_prefs
if [ "$MODE_IDX" = 1 ]; then collect_self_hosted; plan_self_hosted; else collect_managed; plan_managed; fi
plan_show
printf '  %sEstimated total: ~$%s/month%s (Azure list price, %s — excludes egress)\n\n' \
  "$C_BOLD" "$PLAN_TOTAL" "$C_RST" "$REGION"
plan_confirm

if [ "$MODE_IDX" = 1 ]; then deploy_self_hosted; else deploy_managed; fi
summary
