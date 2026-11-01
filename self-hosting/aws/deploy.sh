#!/usr/bin/env bash
# AWS deploy wizard for the streaming/ stack (Kafka -> Flink -> ClickHouse).
#
# Two modes: the exact Docker stack on EC2, or the same pipeline shape on
# MSK / Managed Flink / RDS / Fargate. Nothing is created before plan_confirm.
#
#   bash self-hosting/aws/deploy.sh [--dry-run] [--emulate]
set -euo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=../lib/common.sh
. "$HERE/../lib/common.sh"

REPO_ROOT=$(cd "$HERE/../.." && pwd)
STATE_ROOT="$HERE/state"

DRY_RUN=no
EMULATE=no
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=yes ;;
    --emulate) EMULATE=yes; DRY_RUN=no ;;
    -h|--help) printf 'usage: deploy.sh [--dry-run] [--emulate]\n'; exit 0 ;;
    *) die "unknown flag '$arg'" ;;
  esac
done

if [ "$EMULATE" = yes ]; then
  export AWS_ENDPOINT_URL=http://localhost:4566
  export AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test
  # The STS preflight runs before the region question; the CLI refuses any
  # call without a region. collect_prefs overwrites this with the real answer.
  export AWS_DEFAULT_REGION=us-east-1
  # Belt and braces: CLI v1 honors AWS_ENDPOINT_URL for some services but not
  # all (RDS slips through to the real endpoint). Forcing --endpoint-url on
  # every call guarantees no request can ever leave localhost in emulate mode.
  aws() { command aws --endpoint-url "$AWS_ENDPOINT_URL" "$@"; }
fi

# ---- execution wrappers ----------------------------------------------------
# run: side effects. aws_out: side effects whose output we need (an ID), so
# dry-run has to hand back a plausible placeholder or the rest breaks.
run() {
  if [ "$DRY_RUN" = yes ]; then printf '%s  $ %s%s\n' "$C_DIM" "$*" "$C_RST"; return 0; fi
  "$@"
}

aws_out() {  # aws_out <dry-run-placeholder> <cmd...>
  local ph=$1; shift
  if [ "$DRY_RUN" = yes ]; then
    printf '%s  $ %s%s\n' "$C_DIM" "$*" "$C_RST" >&2
    printf '%s' "$ph"; return 0
  fi
  "$@"
}

# ---- plan accounting -------------------------------------------------------
PLAN_COST=0
plan_item() {  # plan_item "<resource>  <size>" <usd_per_month>
  PLAN_COST=$((PLAN_COST + $2))
  plan_add "$(printf '%-58s ~$%s/mo' "$1" "$2")"
}

# ---- state -----------------------------------------------------------------
state_set() { printf '%s=%s\n' "$1" "$2" >>"$STATE_FILE"; }

# ---- tier maps -------------------------------------------------------------
instance_for_tier() { case $1 in small) echo t3.medium ;; medium) echo m7i.xlarge ;; large) echo m7i.2xlarge ;; esac; }
ec2_cost_for_tier() { case $1 in small) echo 30 ;; medium) echo 147 ;; large) echo 294 ;; esac; }
disk_for_tier()     { case $1 in small) echo 50 ;; medium) echo 100 ;; large) echo 200 ;; esac; }
rds_for_tier()      { case $1 in small|medium) echo db.t4g.micro ;; large) echo db.t4g.small ;; esac; }
rds_cost_for_tier() { case $1 in small|medium) echo 12 ;; large) echo 24 ;; esac; }

# ============================================================================
# 1. preflight
# ============================================================================
preflight() {
  require_cli aws "brew install awscli"
  if [ "$DRY_RUN" = yes ]; then
    warn "--dry-run: every aws call is printed, none are executed"
  elif [ "$EMULATE" = yes ]; then
    warn "--emulate: AWS CLI pointed at LocalStack ($AWS_ENDPOINT_URL)"
    warn "LocalStack cannot emulate: EC2 user-data actually booting, MSK Serverless,"
    warn "Managed Service for Apache Flink, Amazon Managed Grafana, ssh/scp to a VM."
    warn "Those steps are announced and skipped; VPC/S3/SG/IAM/ECR/Secrets are real-ish."
    aws sts get-caller-identity >/dev/null 2>&1 || die "LocalStack not reachable at $AWS_ENDPOINT_URL"
  else
    aws sts get-caller-identity >/dev/null 2>&1 \
      || die "no usable AWS credentials — run 'aws configure' or set AWS_PROFILE"
    ok "AWS credentials valid"
  fi
}

# ============================================================================
# 2. preferences
# ============================================================================
collect_prefs() {
  banner "Deployment settings"

  ask NAME "Deployment name (prefix and tag for every resource)" "plant-stream"
  validate_name "$NAME"

  ask_choice REGION "Region" \
    us-east-1 us-west-2 eu-west-1 eu-central-1 ap-south-1 ap-southeast-1 "other (type it)"
  if [ "$REGION_IDX" = 7 ]; then
    ask REGION "Region code (e.g. sa-east-1)" ""
    if [ "$DRY_RUN" = no ] && [ "$EMULATE" = no ]; then
      aws ec2 describe-regions --region-names "$REGION" --region us-east-1 >/dev/null 2>&1 \
        || die "'$REGION' is not a region this account can see"
    fi
  fi
  export AWS_DEFAULT_REGION="$REGION"

  ask EPS "Estimated events/second at peak" "100"
  TIER=$(size_for_eps "$EPS")
  PARTS=$(partitions_for_tier "$TIER")
  INSTANCE=$(instance_for_tier "$TIER")
  ok "$EPS ev/s → tier $C_BOLD$TIER$C_RST → $INSTANCE, $PARTS partitions/topic"
  info "small ≤5k ev/s = t3.medium · medium ≤20k = m7i.xlarge · large >20k = m7i.2xlarge"

  ask_choice MODE "How should this run?" \
    "Fully self-hosted (this exact Docker stack on EC2)" \
    "Managed services (MSK, Managed Flink, RDS, Fargate)"

  ADMIN_IP=$(my_ip)
  if [ -n "$ADMIN_IP" ]; then
    ok "your public IP: $ADMIN_IP"
  else
    warn "could not detect your public IP — admin access will have to be opened wider"
  fi

  if [ "$MODE_IDX" = 1 ]; then prefs_self_hosted; else prefs_managed; fi

  ask BUCKET "S3 bucket for the compose bundle and backups" "$NAME-artifacts-$REGION"
}

prefs_self_hosted() {
  ask_choice VM_LAYOUT "VM layout" \
    "1 VM — whole stack, Kafka replication factor 1" \
    "3 VMs — Kafka RF 3 (a broker each); flink+apps+Caddy on vm1, ClickHouse+dashboards on vm2"
  if [ "$VM_LAYOUT_IDX" = 1 ]; then VM_COUNT=1; RF=1; else VM_COUNT=3; RF=3; fi
  info "RF $RF: a single broker cannot replicate, so RF must be 1 or topic creation hangs forever."

  ask DISK_GB "EBS gp3 data volume per VM (GB)" "$(disk_for_tier "$TIER")"
  case "$DISK_GB" in *[!0-9]*|'') die "volume size must be a whole number of GB" ;; esac

  if [ -n "$ADMIN_IP" ]; then
    ask_yesno LOCK_ADMIN "Restrict SSH and HTTPS to $ADMIN_IP only" y
  else
    LOCK_ADMIN=no
  fi
  if [ "$LOCK_ADMIN" = yes ]; then
    ADMIN_CIDR="$ADMIN_IP/32"; WEB_CIDR="$ADMIN_IP/32"
  else
    ADMIN_CIDR="${ADMIN_IP:+$ADMIN_IP/32}"; WEB_CIDR="0.0.0.0/0"
    [ -n "$ADMIN_CIDR" ] || die "no admin IP and no lockdown — refusing to open SSH to the world"
    warn "443 open to 0.0.0.0/0 — Caddy basic auth is then the only thing in front of the UIs"
  fi
}

prefs_managed() {
  if [ "$TIER" = large ]; then
    MSK_KIND="provisioned"; MSK_TYPE="kafka.m5.large"; MSK_BROKERS=3; RF=3
  else
    MSK_KIND="serverless"; MSK_TYPE="serverless"; MSK_BROKERS=0; RF=3
  fi
  RDS_CLASS=$(rds_for_tier "$TIER")

  ask_secret CH_API_KEY "ClickHouse Cloud API key (blank = ClickHouse on a small private EC2)"
  if [ -n "$CH_API_KEY" ]; then CH_TARGET="cloud"; else CH_TARGET="ec2"; fi

  ask_choice CONSUMERS "Where do the plant-risk consumers run?" \
    "ECS Fargate services (the containers as-is)" \
    "Lambda sketch (note only — the consumers are long-lived Kafka loops)"
  if [ "$CONSUMERS_IDX" = 2 ]; then
    warn "Lambda path is documented, not built: these services hold consumer-group"
    warn "membership and per-key EWMA state, which a 15-minute invocation cannot."
    warn "Falling back to Fargate for the resources actually created."
  fi
  ADMIN_CIDR="${ADMIN_IP:+$ADMIN_IP/32}"
  WEB_CIDR="${ADMIN_CIDR:-0.0.0.0/0}"
}

# ============================================================================
# 3. plan
# ============================================================================
plan_network() {
  plan_item "VPC $VPC_CIDR + IGW + route tables ($NAME-vpc)" 0
  plan_item "Public subnet 10.60.0.0/20 — TLS front door only" 0
  plan_item "Private subnets 10.60.16.0/20, 10.60.32.0/20 — data services" 0
  plan_item "Security groups: 80/443 from $WEB_CIDR, 22 from ${ADMIN_CIDR:-none}" 0
  plan_item "Security group: service ports intra-VPC only, no internet ingress" 0
  plan_item "S3 bucket $BUCKET (private, versioned)" 1
}

plan_self_hosted() {
  local i
  plan_network
  plan_item "EC2 key pair $NAME-key (private half saved chmod 400 locally)" 0
  for i in $(seq 1 "$VM_COUNT"); do
    plan_item "EC2 vm$i — $INSTANCE, Ubuntu 24.04, cloud-init docker" "$(ec2_cost_for_tier "$TIER")"
    plan_item "EBS gp3 ${DISK_GB}G attached to vm$i" $((DISK_GB * 8 / 100))
  done
  plan_item "Elastic IP on vm1 (Caddy / Let's Encrypt needs a stable address)" 4
  if [ "$VM_COUNT" -gt 1 ]; then
    plan_item "NAT gateway — image pulls for the private VMs" 33
  fi
  plan_item "$(echo "$TOPICS" | wc -w | tr -d ' ') Kafka topics, $PARTS partitions, RF $RF" 0
}

plan_managed() {
  plan_network
  if [ "$MSK_KIND" = serverless ]; then
    plan_item "MSK Serverless cluster $NAME-msk (IAM auth, private subnets)" 550
  else
    plan_item "MSK provisioned — $MSK_BROKERS x $MSK_TYPE, RF $RF" 460
  fi
  plan_item "Managed Service for Apache Flink $NAME-flink (2 KPU, app shell only)" 160
  plan_item "RDS Postgres 16 $RDS_CLASS — plant master data, private" "$(rds_cost_for_tier "$TIER")"
  if [ "$CH_TARGET" = cloud ]; then
    plan_item "ClickHouse Cloud service (billed by ClickHouse, key in Secrets Manager)" 50
  else
    plan_item "EC2 t3.small in a private subnet running ClickHouse 26.7" 15
  fi
  plan_item "ECR repositories for 6 app images (simulator, risk-engine, redrive, notifier, ingest, dashboard)" 2
  plan_item "ECS Fargate cluster $NAME-ecs — 6 services @ 0.5 vCPU / 1 GB" 90
  plan_item "Application Load Balancer — the only public ingress (443)" 17
  plan_item "NAT gateway — Fargate tasks pull images and reach the internet" 33
  plan_item "Amazon Managed Grafana workspace (1 admin, AWS IAM Identity Center)" 9
  plan_item "Secrets Manager — 5 generated secrets" 2
  plan_item "$(echo "$TOPICS" | wc -w | tr -d ' ') Kafka topics, $PARTS partitions, RF $RF" 0
}

# ============================================================================
# 4. shared networking
# ============================================================================
VPC_CIDR="10.60.0.0/16"

deploy_network() {
  banner "Networking"
  VPC_ID=$(aws_out vpc-dryrun00000000 aws ec2 create-vpc --cidr-block "$VPC_CIDR" \
    --tag-specifications "ResourceType=vpc,Tags=[{Key=Name,Value=$NAME-vpc},{Key=deployment,Value=$NAME}]" \
    --query Vpc.VpcId --output text)
  run aws ec2 modify-vpc-attribute --vpc-id "$VPC_ID" --enable-dns-hostnames
  state_set VPC_ID "$VPC_ID"

  IGW_ID=$(aws_out igw-dryrun00000000 aws ec2 create-internet-gateway \
    --tag-specifications "ResourceType=internet-gateway,Tags=[{Key=deployment,Value=$NAME}]" \
    --query InternetGateway.InternetGatewayId --output text)
  run aws ec2 attach-internet-gateway --internet-gateway-id "$IGW_ID" --vpc-id "$VPC_ID"
  state_set IGW_ID "$IGW_ID"

  AZ_A="${REGION}a"; AZ_B="${REGION}b"
  SUBNET_PUB=$(create_subnet 10.60.0.0/20  "$AZ_A" public)
  SUBNET_A=$(create_subnet   10.60.16.0/20 "$AZ_A" private)
  SUBNET_B=$(create_subnet   10.60.32.0/20 "$AZ_B" private)
  run aws ec2 modify-subnet-attribute --subnet-id "$SUBNET_PUB" --map-public-ip-on-launch
  state_set SUBNET_PUB "$SUBNET_PUB"; state_set SUBNET_A "$SUBNET_A"; state_set SUBNET_B "$SUBNET_B"

  RT_PUB=$(aws_out rtb-dryrun00000000 aws ec2 create-route-table --vpc-id "$VPC_ID" \
    --tag-specifications "ResourceType=route-table,Tags=[{Key=Name,Value=$NAME-public},{Key=deployment,Value=$NAME}]" \
    --query RouteTable.RouteTableId --output text)
  run aws ec2 create-route --route-table-id "$RT_PUB" --destination-cidr-block 0.0.0.0/0 --gateway-id "$IGW_ID"
  run aws ec2 associate-route-table --route-table-id "$RT_PUB" --subnet-id "$SUBNET_PUB"
  state_set RT_PUB "$RT_PUB"

  # Front-door SG: the only group with any internet ingress at all.
  SG_FRONT=$(create_sg "$NAME-front" "TLS front door (Caddy/ALB) + admin SSH")
  run aws ec2 authorize-security-group-ingress --group-id "$SG_FRONT" --protocol tcp --port 80 --cidr "$WEB_CIDR"
  run aws ec2 authorize-security-group-ingress --group-id "$SG_FRONT" --protocol tcp --port 443 --cidr "$WEB_CIDR"
  if [ -n "${ADMIN_CIDR:-}" ]; then
    run aws ec2 authorize-security-group-ingress --group-id "$SG_FRONT" --protocol tcp --port 22 --cidr "$ADMIN_CIDR"
  fi

  # Data SG: reachable from inside the VPC and nowhere else. Kafka 9092,
  # ClickHouse 8123/9000, Postgres 5432, Flink 8081 all live behind this.
  SG_DATA=$(create_sg "$NAME-data" "intra-VPC service ports, no internet ingress")
  run aws ec2 authorize-security-group-ingress --group-id "$SG_DATA" --protocol tcp --port 0-65535 --cidr "$VPC_CIDR"
  state_set SG_FRONT "$SG_FRONT"; state_set SG_DATA "$SG_DATA"

  run aws s3api create-bucket --bucket "$BUCKET" \
    $([ "$REGION" = us-east-1 ] || printf -- '--create-bucket-configuration LocationConstraint=%s' "$REGION")
  run aws s3api put-public-access-block --bucket "$BUCKET" \
    --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
  state_set BUCKET "$BUCKET"
  ok "VPC $VPC_ID, subnets, security groups, bucket $BUCKET"
}

create_subnet() {  # create_subnet <cidr> <az> <name-suffix>
  aws_out "subnet-dryrun-$3" aws ec2 create-subnet --vpc-id "$VPC_ID" --cidr-block "$1" \
    --availability-zone "$2" \
    --tag-specifications "ResourceType=subnet,Tags=[{Key=Name,Value=$NAME-$3},{Key=deployment,Value=$NAME}]" \
    --query Subnet.SubnetId --output text
}

create_sg() {  # create_sg <name> <description>
  aws_out "sg-dryrun-$1" aws ec2 create-security-group --group-name "$1" --description "$2" \
    --vpc-id "$VPC_ID" \
    --tag-specifications "ResourceType=security-group,Tags=[{Key=deployment,Value=$NAME}]" \
    --query GroupId --output text
}

# ============================================================================
# 5. self-hosted execution
# ============================================================================
deploy_self_hosted() {
  deploy_network
  banner "EC2"

  KEY_PATH="$STATE_DIR/$NAME-key.pem"
  if [ "$DRY_RUN" = yes ]; then
    run aws ec2 create-key-pair --key-name "$NAME-key" --query KeyMaterial --output text
  elif [ -s "$KEY_PATH" ] && aws ec2 describe-key-pairs --key-names "$NAME-key" >/dev/null 2>&1; then
    # Re-run with the same name: the pem is chmod 400, so a blind > would die
    # on Permission denied. Reuse the pair instead of rotating it mid-deploy.
    ok "reusing existing key pair $NAME-key ($KEY_PATH)"
  else
    umask 077
    rm -f "$KEY_PATH"
    aws ec2 delete-key-pair --key-name "$NAME-key" >/dev/null 2>&1 || true
    aws ec2 create-key-pair --key-name "$NAME-key" \
      --tag-specifications "ResourceType=key-pair,Tags=[{Key=deployment,Value=$NAME}]" \
      --query KeyMaterial --output text >"$KEY_PATH"
    chmod 400 "$KEY_PATH"
    ok "key pair saved to $KEY_PATH (mode 400)"
  fi
  state_set KEY_NAME "$NAME-key"; state_set KEY_PATH "$KEY_PATH"

  # cloud-init wants the public half inline so the admin user is `plant`,
  # not the AMI's default `ubuntu`.
  local pubkey userdata
  pubkey=$([ "$DRY_RUN" = yes ] && echo "ssh-rsa DRYRUN" || ssh-keygen -y -f "$KEY_PATH")
  userdata="$STATE_DIR/user-data.yaml"
  sed "s|__SSH_PUBKEY__|$pubkey|" "$HERE/cloud-init.yaml" >"$userdata"

  # Canonical publishes the current AMI id per region in SSM, so nothing here
  # is pinned to a region-specific ami-… that rots. LocalStack has no public
  # SSM parameters, only a mock AMI catalogue — take its first image there.
  if [ "$EMULATE" = yes ]; then
    AMI_ID=$(aws ec2 describe-images --query 'Images[0].ImageId' --output text 2>/dev/null)
    [ -n "$AMI_ID" ] && [ "$AMI_ID" != None ] || AMI_ID=ami-emulate00000000
  else
    AMI_ID=$(aws_out ami-dryrun00000000 aws ssm get-parameter \
      --name /aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id \
      --query Parameter.Value --output text)
  fi

  local i subnet sg vm_id
  VM_IDS=""
  for i in $(seq 1 "$VM_COUNT"); do
    # vm1 is the front door; everything else sits private behind it.
    if [ "$i" = 1 ]; then subnet="$SUBNET_PUB"; sg="$SG_FRONT,$SG_DATA"; else subnet="$SUBNET_A"; sg="$SG_DATA"; fi
    vm_id=$(aws_out "i-dryrun0000000$i" aws ec2 run-instances --image-id "$AMI_ID" \
      --instance-type "$INSTANCE" --key-name "$NAME-key" --subnet-id "$subnet" \
      --security-group-ids $(echo "$sg" | tr ',' ' ') \
      --block-device-mappings "DeviceName=/dev/sda1,Ebs={VolumeSize=$DISK_GB,VolumeType=gp3,Encrypted=true,DeleteOnTermination=true}" \
      --user-data "file://$userdata" \
      --metadata-options HttpTokens=required \
      --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$NAME-vm$i},{Key=deployment,Value=$NAME},{Key=role,Value=vm$i}]" \
      --query 'Instances[0].InstanceId' --output text)
    VM_IDS="$VM_IDS $vm_id"
    state_set "VM${i}_ID" "$vm_id"
  done
  run aws ec2 wait instance-running --instance-ids $VM_IDS

  VM1_ID=$(echo "$VM_IDS" | awk '{print $1}')
  EIP_ALLOC=$(aws_out eipalloc-dryrun0000 aws ec2 allocate-address --domain vpc \
    --tag-specifications "ResourceType=elastic-ip,Tags=[{Key=deployment,Value=$NAME}]" \
    --query AllocationId --output text)
  run aws ec2 associate-address --allocation-id "$EIP_ALLOC" --instance-id "$VM1_ID"
  PUBLIC_IP=$(aws_out 203.0.113.10 aws ec2 describe-addresses --allocation-ids "$EIP_ALLOC" \
    --query 'Addresses[0].PublicIp' --output text)
  state_set EIP_ALLOC "$EIP_ALLOC"; state_set PUBLIC_IP "$PUBLIC_IP"
  ok "vm1 is $VM1_ID at $PUBLIC_IP"

  ship_stack
  create_topics_self_hosted
}

SSH_OPTS="-o StrictHostKeyChecking=accept-new -o ConnectTimeout=15"

remote() {  # run a command on vm1
  run ssh $SSH_OPTS -i "$KEY_PATH" "plant@$PUBLIC_IP" "$*"
}

ship_stack() {
  banner "Shipping the stack"
  if [ "$EMULATE" = yes ]; then
    warn "skipped: LocalStack has no real VM to scp to or run docker on"
    return
  fi

  local bundle="$STATE_DIR/streaming.tar.gz"
  run tar -czf "$bundle" -C "$REPO_ROOT" \
    --exclude='.env' --exclude='__pycache__' --exclude='.pytest_cache' streaming
  run aws s3 cp "$bundle" "s3://$BUCKET/bundles/streaming.tar.gz"

  # cloud-init installs docker; scp'ing before it finishes lands the bundle on
  # a box that cannot build it.
  info "waiting for cloud-init to finish on vm1 (docker install)…"
  run ssh $SSH_OPTS -i "$KEY_PATH" "plant@$PUBLIC_IP" \
    "cloud-init status --wait >/dev/null"

  run scp $SSH_OPTS -i "$KEY_PATH" "$bundle" "plant@$PUBLIC_IP:/opt/streaming/"
  remote "tar -xzf /opt/streaming/streaming.tar.gz -C /opt/streaming --strip-components=1"

  # Secrets are generated locally, never prompted, and land chmod 600.
  local envf="$STATE_DIR/stack.env"
  write_stack_env "$envf" "$EPS"
  run scp $SSH_OPTS -i "$KEY_PATH" "$envf" "plant@$PUBLIC_IP:/opt/streaming/.env"

  # Caddy's basic_auth wants a bcrypt hash, which only the caddy image can
  # produce, and the Caddyfile's hostnames are hard-coded to the reference
  # box's sslip.io name — both have to be fixed up on the instance.
  local dashed
  dashed=$(echo "$PUBLIC_IP" | tr '.' '-')
  remote "cd /opt/streaming && \
    UI_PW=\$(openssl rand -hex 12) && DASH_PW=\$(openssl rand -hex 12) && \
    printf 'STREAMING_UI_PASSWORD=%s\nSTREAMING_UI_HASH=%s\nDASH_UI_PASSWORD=%s\nDASH_UI_HASH=%s\nCLICKHOUSE_PASSWORD=%s\n' \
      \"\$UI_PW\" \"\$(docker run --rm caddy:2-alpine caddy hash-password --plaintext \$UI_PW)\" \
      \"\$DASH_PW\" \"\$(docker run --rm caddy:2-alpine caddy hash-password --plaintext \$DASH_PW)\" \
      \"\$(openssl rand -hex 12)\" >> .env && chmod 600 .env"
  remote "sed -i 's/reference-host/$dashed/g' /opt/streaming/caddy/Caddyfile /opt/streaming/docker-compose.yml"

  info "building images on the instance — first run pulls Flink, ClickHouse and Kafka"
  remote "cd /opt/streaming && docker compose --profile plantrisk up -d --build"
  ok "stack up on vm1"

  if [ "$VM_COUNT" -gt 1 ]; then
    warn "vm2/vm3 are provisioned and on the private subnet, but the compose file"
    warn "in the repo is single-broker. Each needs its own KAFKA_NODE_ID, a shared"
    warn "KAFKA_CONTROLLER_QUORUM_VOTERS listing all three, and vm2 takes over the"
    warn "clickhouse+grafana+dashboard services. Bundle and keys are on vm1."
  fi
}

create_topics_self_hosted() {
  banner "Kafka topics"
  if [ "$EMULATE" = yes ]; then warn "skipped: no broker in LocalStack"; return; fi

  # RF must never exceed the number of live brokers: topic creation does not
  # error, it blocks forever waiting for replicas that will never exist.
  if [ "$VM_COUNT" -gt 1 ]; then
    local f="$STATE_DIR/create-topics.sh" t
    {
      printf '#!/usr/bin/env bash\n# Run on vm1 once all %s brokers have joined the KRaft quorum.\nset -euo pipefail\n' "$VM_COUNT"
      for t in $TOPICS; do
        printf 'docker exec kafka /opt/kafka/bin/kafka-topics.sh --create --if-not-exists \\\n  --bootstrap-server localhost:9092 --topic %s --partitions %s --replication-factor %s\n' "$t" "$PARTS" "$RF"
      done
    } >"$f"
    chmod +x "$f"
    warn "RF $RF needs all $VM_COUNT brokers up — commands written to $f instead of run"
    return
  fi

  local t
  for t in $TOPICS; do
    remote "docker exec kafka /opt/kafka/bin/kafka-topics.sh --create --if-not-exists \
      --bootstrap-server localhost:9092 --topic $t --partitions $PARTS --replication-factor $RF"
  done
  ok "$(echo "$TOPICS" | wc -w | tr -d ' ') topics, $PARTS partitions, RF $RF"
}

# ============================================================================
# 6. managed execution
# ============================================================================
APP_IMAGES="plant-simulator plant-risk-engine plant-dlq-redrive plant-alert-notifier plant-ingest plant-dashboard"

deploy_managed() {
  deploy_network
  banner "Managed services"

  local pg_pw ch_pw ingest_key
  pg_pw=$(gen_password); ch_pw=$(gen_password); ingest_key=$(gen_password)
  put_secret "$NAME/postgres" "$pg_pw"
  put_secret "$NAME/clickhouse-viewer" "$ch_pw"
  put_secret "$NAME/ingest-api-key" "$ingest_key"
  if [ -n "${CH_API_KEY:-}" ]; then put_secret "$NAME/clickhouse-cloud-api-key" "$CH_API_KEY"; fi

  # LocalStack (Pro included) implements only classic create-cluster —
  # CreateClusterV2/serverless returns "not yet implemented".
  if [ "$EMULATE" = yes ] && [ "$MSK_KIND" = serverless ]; then
    warn "LocalStack cannot emulate MSK Serverless — using a provisioned mock cluster instead"
    MSK_KIND=provisioned; MSK_BROKERS=2; MSK_TYPE=kafka.t3.small
  fi
  if [ "$MSK_KIND" = serverless ]; then
    # Serverless is IAM-auth only and picks its own replication; there is no
    # RF knob, and clients must use the aws-msk-iam-auth callback handler.
    MSK_ARN=$(aws_out "arn:aws:kafka:$REGION:000000000000:cluster/$NAME-msk/dryrun" \
      aws kafka create-cluster-v2 --cluster-name "$NAME-msk" \
      --serverless "VpcConfigs=[{SubnetIds=[$SUBNET_A,$SUBNET_B],SecurityGroupIds=[$SG_DATA]}],ClientAuthentication={Sasl={Iam={Enabled=true}}}" \
      --query ClusterArn --output text)
  else
    MSK_ARN=$(aws_out "arn:aws:kafka:$REGION:000000000000:cluster/$NAME-msk/dryrun" \
      aws kafka create-cluster --cluster-name "$NAME-msk" --kafka-version 3.9.x \
      --number-of-broker-nodes "$MSK_BROKERS" \
      --broker-node-group-info "InstanceType=$MSK_TYPE,ClientSubnets=[$SUBNET_A,$SUBNET_B],SecurityGroups=[$SG_DATA]" \
      --encryption-info "EncryptionInTransit={ClientBroker=TLS,InCluster=true}" \
      --query ClusterArn --output text)
  fi
  state_set MSK_ARN "$MSK_ARN"

  run aws rds create-db-subnet-group --db-subnet-group-name "$NAME-pg" \
    --db-subnet-group-description "$NAME private" --subnet-ids "$SUBNET_A" "$SUBNET_B"
  run aws rds create-db-instance --db-instance-identifier "$NAME-pg" \
    --db-instance-class "$RDS_CLASS" --engine postgres --engine-version 16 \
    --allocated-storage 20 --storage-type gp3 --storage-encrypted \
    --master-username plant --master-user-password "$pg_pw" --db-name plant_ops \
    --db-subnet-group-name "$NAME-pg" --vpc-security-group-ids "$SG_DATA" \
    --no-publicly-accessible --backup-retention-period 7
  state_set RDS_ID "$NAME-pg"

  # Managed Flink runs Python only through the Table API, and the job must be
  # a zip containing the .py plus every connector jar (flink-sql-connector-kafka)
  # in S3 — it will not pip-install at runtime. jobs/plant_risk_shadow.py uses
  # the DataStream API with a Postgres lookup, so it needs porting first. The
  # application shell is created empty and left in READY, never started.
  FLINK_APP="$NAME-flink"
  run aws kinesisanalyticsv2 create-application --application-name "$FLINK_APP" \
    --runtime-environment FLINK-1_20 --service-execution-role "arn:aws:iam::$(account_id):role/$NAME-flink-role" \
    --application-configuration "FlinkApplicationConfiguration={ParallelismConfiguration={ConfigurationType=CUSTOM,Parallelism=2,ParallelismPerKPU=1}},ApplicationSnapshotConfiguration={SnapshotsEnabled=true}"
  state_set FLINK_APP "$FLINK_APP"
  warn "Managed Flink: PyFlink support is Table API only and needs a packaged zip"
  warn "(job + connector jars) uploaded to s3://$BUCKET/flink/. Shell created, not started."

  if [ "$CH_TARGET" = ec2 ]; then
    CH_INSTANCE=$(aws_out i-dryrunclickhouse aws ec2 run-instances --image-id "$(ubuntu_ami)" \
      --instance-type t3.small --subnet-id "$SUBNET_A" --security-group-ids "$SG_DATA" \
      --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$NAME-clickhouse},{Key=deployment,Value=$NAME}]" \
      --query 'Instances[0].InstanceId' --output text)
    state_set CH_INSTANCE "$CH_INSTANCE"
    warn "no ClickHouse Cloud key given — ClickHouse runs on $CH_INSTANCE in a private subnet"
  fi

  banner "Containers"
  local img
  for img in $APP_IMAGES; do
    run aws ecr create-repository --repository-name "$NAME/$img" --image-scanning-configuration scanOnPush=true
  done
  ECR_BASE="$(account_id).dkr.ecr.$REGION.amazonaws.com/$NAME"
  state_set ECR_BASE "$ECR_BASE"

  run aws ecs create-cluster --cluster-name "$NAME-ecs" --capacity-providers FARGATE \
    --tags "key=deployment,value=$NAME"
  state_set ECS_CLUSTER "$NAME-ecs"
  info "task definitions reference $ECR_BASE/<image>:latest — push them with:"
  for img in $APP_IMAGES; do
    printf '%s    docker buildx build --platform linux/amd64 -t %s/%s:latest streaming/... --push%s\n' \
      "$C_DIM" "$ECR_BASE" "$img" "$C_RST"
  done

  if [ "$EMULATE" = yes ]; then
    warn "skipped: LocalStack does not support Amazon Managed Grafana"
    GRAFANA_WS=g-emulated
  else
    GRAFANA_WS=$(aws_out g-dryrun aws grafana create-workspace --workspace-name "$NAME-grafana" \
      --account-access-type CURRENT_ACCOUNT --authentication-providers AWS_SSO \
      --permission-type SERVICE_MANAGED --workspace-data-sources PROMETHEUS \
      --query 'workspace.id' --output text)
  fi
  state_set GRAFANA_WS "$GRAFANA_WS"
  warn "Managed Grafana has no first-party ClickHouse plugin — install grafana-clickhouse-datasource"
  warn "from the workspace's plugin catalogue, or keep the self-hosted Grafana container."

  create_topics_managed
}

account_id() { aws_out 000000000000 aws sts get-caller-identity --query Account --output text; }

ubuntu_ami() {
  if [ "$EMULATE" = yes ]; then
    local ami
    ami=$(aws ec2 describe-images --query 'Images[0].ImageId' --output text 2>/dev/null)
    if [ -n "$ami" ] && [ "$ami" != None ]; then echo "$ami"; else echo ami-emulate00000000; fi
    return
  fi
  aws_out ami-dryrun00000000 aws ssm get-parameter \
    --name /aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id \
    --query Parameter.Value --output text
}

put_secret() {  # put_secret <name> <value> — re-run safe: update if it exists
  if [ "$DRY_RUN" = no ] && aws secretsmanager describe-secret --secret-id "$1" >/dev/null 2>&1; then
    run aws secretsmanager put-secret-value --secret-id "$1" --secret-string "$2"
    return
  fi
  run aws secretsmanager create-secret --name "$1" --secret-string "$2" \
    --tags "Key=deployment,Value=$NAME"
  state_set SECRET_"$(echo "$1" | tr '/-' '__')" "$1"
}

create_topics_managed() {
  # MSK has no control-plane API for topics — they are created with the Kafka
  # admin protocol from inside the VPC. The script writes the exact commands
  # instead of pretending it can reach a private broker from the laptop.
  local f="$STATE_DIR/create-topics.sh" t
  {
    printf '#!/usr/bin/env bash\n# Run from any host inside %s (bastion or a Fargate exec session).\n' "$NAME-vpc"
    printf 'set -euo pipefail\nBOOTSTRAP=$(aws kafka get-bootstrap-brokers --cluster-arn %s --query BootstrapBrokerStringSaslIam --output text)\n' "$MSK_ARN"
    for t in $TOPICS; do
      printf 'kafka-topics.sh --bootstrap-server "$BOOTSTRAP" --command-config client.properties \\\n  --create --if-not-exists --topic %s --partitions %s --replication-factor %s\n' "$t" "$PARTS" "$RF"
    done
  } >"$f"
  chmod +x "$f"
  ok "topic creation script written to $f (IAM auth needs client.properties with the MSK IAM callback)"
}

# ============================================================================
# 7. summary
# ============================================================================
summary_self_hosted() {
  local dashed; dashed=$(echo "$PUBLIC_IP" | tr '.' '-')
  banner "Deployed — $NAME"
  cat <<EOF
  SSH        ssh -i $KEY_PATH plant@$PUBLIC_IP
  Secrets    /opt/streaming/.env on vm1 (mode 600) — nothing was printed here
  State      $STATE_FILE

  Public (Caddy, the only thing on 0.0.0.0 — sslip.io gives Let's Encrypt a
  name to issue against, since it will not certify a bare IP):
    https://kafka.$dashed.sslip.io      admin / STREAMING_UI_PASSWORD
    https://flink.$dashed.sslip.io      admin / STREAMING_UI_PASSWORD
    https://dash.$dashed.sslip.io       admin / DASH_UI_PASSWORD
    https://grafana.$dashed.sslip.io    admin / GRAFANA_ADMIN_PASSWORD
    https://ingest.$dashed.sslip.io     Bearer INGEST_API_KEY

  Everything else stays on 127.0.0.1. Tunnel for the raw ports:
    ssh -i $KEY_PATH -N \\
      -L 8081:127.0.0.1:8081 -L 8082:127.0.0.1:8082 \\
      -L 8123:127.0.0.1:8123 -L 29092:127.0.0.1:29092 \\
      plant@$PUBLIC_IP

  Next:
    ssh … 'cd /opt/streaming && docker compose ps'
    Submit the Flink job:  docker exec flink-jobmanager flink run -py /opt/flink/jobs/plant_risk_shadow.py
    Email alerts:          set RESEND_API_KEY + EMAIL_ENABLED=true in .env (off by default)
    Claude RCA:            set ANTHROPIC_API_KEY, then flip RCA_ENABLED from the dashboard
    Teardown:              bash $HERE/teardown.sh $NAME
EOF
}

summary_managed() {
  banner "Deployed — $NAME"
  cat <<EOF
  Kafka      $MSK_ARN ($MSK_KIND, private subnets, IAM/TLS auth)
  Postgres   $NAME-pg ($RDS_CLASS, not publicly accessible)
  Flink      $FLINK_APP — application shell only, see the PyFlink note above
  ClickHouse $([ "$CH_TARGET" = cloud ] && echo "ClickHouse Cloud (your key, in Secrets Manager)" || echo "EC2 ${CH_INSTANCE:-} in a private subnet")
  Images     $ECR_BASE/<service>:latest
  Grafana    workspace $GRAFANA_WS
  Secrets    AWS Secrets Manager under $NAME/*
  State      $STATE_FILE

  Next:
    1. Build and push the six images to ECR (commands printed above).
    2. Register the Fargate task definitions against $ECR_BASE and set
       KAFKA_BOOTSTRAP to the MSK bootstrap string (IAM SASL).
    3. Run $STATE_DIR/create-topics.sh from inside the VPC.
    4. Package the PyFlink job (Table API + connector jars) to s3://$BUCKET/flink/
       and update $FLINK_APP's code configuration.
    5. Teardown: bash $HERE/teardown.sh $NAME
EOF
}

# ============================================================================
main() {
  banner "AWS deploy — streaming stack (Kafka → Flink → ClickHouse)"
  preflight
  collect_prefs

  if [ "$MODE_IDX" = 1 ]; then plan_self_hosted; else plan_managed; fi
  plan_add ""
  plan_add "$(printf '%-58s ~$%s/mo' 'ESTIMATED TOTAL (on-demand, us-east-1 pricing)' "$PLAN_COST")"
  plan_show
  warn "estimates exclude data transfer and per-request charges"
  plan_confirm

  STATE_DIR="$STATE_ROOT/$NAME"
  mkdir -p "$STATE_DIR"
  STATE_FILE="$STATE_DIR/state.env"
  : >"$STATE_FILE"
  state_set NAME "$NAME"; state_set REGION "$REGION"; state_set MODE "$MODE_IDX"
  state_set TIER "$TIER"; state_set EPS "$EPS"

  if [ "$MODE_IDX" = 1 ]; then
    deploy_self_hosted; summary_self_hosted
  else
    deploy_managed; summary_managed
  fi
}

main "$@"
