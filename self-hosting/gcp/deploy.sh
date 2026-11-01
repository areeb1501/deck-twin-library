#!/usr/bin/env bash
# GCP deploy wizard for the streaming/ stack (Kafka -> Flink -> ClickHouse).
#
# Three modes, chosen in the wizard:
#   self-hosted   — this exact compose stack on GCE, 1 or 3 VMs
#   cloud-native  — the pipeline rebuilt on GCP's own services: Pub/Sub,
#                   Dataflow, BigQuery, Cloud Run, GCS. No VMs, no Kafka, no
#                   ClickHouse. The Flink jobs need porting to Beam; the wizard
#                   says so instead of pretending otherwise.
#   lift-and-shift — the same pipeline shape on managed lookalikes: Managed
#                   Service for Apache Kafka, Cloud SQL, ClickHouse Cloud
#                   (or a ClickHouse VM), Flink still on a GCE VM.
#
# --dry-run prints every gcloud/bq/gsutil command instead of running it. That is
# the only local test path: GCP's emulators (pubsub, firestore, bigtable,
# datastore) cover data-plane APIs only — there is no emulator for the GCE,
# Managed Kafka, Cloud SQL, BigQuery or Cloud Run *control* planes, so a wizard
# that creates infrastructure cannot be exercised offline any other way.
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
# shellcheck source=../lib/common.sh
. "$SCRIPT_DIR/../lib/common.sh"

DRY_RUN=no
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=yes ;;
    -h|--help) printf 'usage: %s [--dry-run]\n' "$0"; exit 0 ;;
    *) die "unknown flag '$arg' (only --dry-run)" ;;
  esac
done

# Single choke point for anything that mutates the account.
run() {
  if [ "$DRY_RUN" = yes ]; then
    printf '%s  $' "$C_DIM"; printf ' %q' "$@"; printf '%s\n' "$C_RST"
  else
    "$@"
  fi
}

# Secrets go in over stdin so they never appear in a process list or in the
# dry-run transcript.
create_secret() {  # create_secret NAME VALUE
  if [ "$DRY_RUN" = yes ]; then
    printf '%s  $ printf ... | gcloud secrets create %s --data-file=- --replication-policy=automatic%s\n' \
      "$C_DIM" "$1" "$C_RST"
    return
  fi
  printf '%s' "$2" | gcloud secrets create "$1" --project="$PROJECT" \
    --replication-policy=automatic --labels="deployment=$NAME" --data-file=- >/dev/null
}

# common.sh's gen_password pipes tr into `head -c 24`: head exits first, tr dies
# of SIGPIPE, and the `set -o pipefail` that common.sh itself sets turns that
# into status 141. In `pw=$(gen_password)` that is a fatal error under set -e —
# the deploy stops dead, mid-run, with no message. The value is already on
# stdout by then, so swallowing the status is safe. Worth fixing in
# lib/common.sh once, for all three clouds.
new_password() { gen_password || true; }

COST_TOTAL=0
plan_cost() {  # plan_cost 27 "1x e2-medium ..."
  local usd=$1; shift
  COST_TOTAL=$((COST_TOTAL + usd))
  plan_add "$* $C_DIM(~\$$usd/mo)$C_RST"
}

# ---- tier -> shape mappings -------------------------------------------------
tier_machine() { case "$1" in small) echo e2-medium ;; medium) echo n2-standard-4 ;; large) echo n2-standard-8 ;; esac; }
tier_vcpu()    { case "$1" in small) echo 2 ;; medium) echo 4 ;; large) echo 8 ;; esac; }
tier_ram()     { case "$1" in small) echo 4 ;; medium) echo 16 ;; large) echo 32 ;; esac; }
tier_vm_cost() { case "$1" in small) echo 27 ;; medium) echo 140 ;; large) echo 280 ;; esac; }
tier_disk()    { case "$1" in small) echo 50 ;; medium) echo 100 ;; large) echo 200 ;; esac; }
# Managed Kafka bills per vCPU and per GiB; 3 vCPU is the documented floor for
# a usable cluster and the RAM:vCPU ratio must sit between 1 and 8 GiB/vCPU.
tier_kafka_cpu() { case "$1" in small) echo 3 ;; medium) echo 6 ;; large) echo 12 ;; esac; }
tier_kafka_mem() { case "$1" in small) echo 3 ;; medium) echo 12 ;; large) echo 24 ;; esac; }
tier_kafka_cost(){ case "$1" in small) echo 200 ;; medium) echo 420 ;; large) echo 850 ;; esac; }
tier_sql()       { case "$1" in small) echo db-custom-1-3840 ;; *) echo db-custom-2-7680 ;; esac; }
tier_sql_cost()  { case "$1" in small) echo 55 ;; *) echo 110 ;; esac; }
# Pub/Sub and Dataflow both autoscale, so events/second buys almost nothing at
# provisioning time. It sets one number — the Dataflow worker ceiling, which is
# the only guard against an autoscaler quietly spending the month's budget.
tier_max_workers()  { case "$1" in small) echo 4 ;; medium) echo 12 ;; large) echo 32 ;; esac; }
tier_stream_cost()  { case "$1" in small) echo 210 ;; medium) echo 620 ;; large) echo 1600 ;; esac; }

SUBNET_CIDR="10.62.0.0/16"
IAP_CIDR="35.235.240.0/20"     # Google's IAP TCP-forwarding source range

# ---- phase 1: preflight -----------------------------------------------------
preflight() {
  banner "GCP deploy wizard — streaming stack"
  [ "$DRY_RUN" = yes ] && warn "--dry-run: every gcloud/gsutil call is printed, not executed"

  local default_project=""
  if [ "$DRY_RUN" = no ]; then
    # Skipped in dry-run so the transcript can be reviewed on a laptop that has
    # no gcloud and no GCP account at all.
    require_cli gcloud "https://cloud.google.com/sdk/docs/install"
    gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null | grep -q . \
      || die "no active gcloud account — run: gcloud auth login"
    default_project=$(gcloud config get-value project 2>/dev/null || true)
    [ "$default_project" = "(unset)" ] && default_project=""
  fi
  ask PROJECT "GCP project ID" "${default_project:-my-project}"
}

# ---- phase 2: preferences ---------------------------------------------------
collect_prefs() {
  ask NAME "Deployment name (prefix + 'deployment' label on every resource)" "plant-stream"
  validate_name "$NAME"

  ask_choice REGION "Region" \
    us-central1 us-east1 europe-west1 europe-west3 asia-south1 asia-southeast1
  ZONE="$REGION-a"
  ask_yesno OVERRIDE_ZONE "Zone defaults to $ZONE — pick a different one?" n
  [ "$OVERRIDE_ZONE" = yes ] && ask ZONE "Zone" "$ZONE"

  ask EPS "Estimated events/second at peak" "100"
  TIER=$(size_for_eps "$EPS")
  PARTS=$(partitions_for_tier "$TIER")
  info "$EPS ev/s -> $C_BOLD$TIER$C_RST: $(tier_machine "$TIER") ($(tier_vcpu "$TIER") vCPU / $(tier_ram "$TIER") GB), $PARTS partitions/topic"
  printf '    %ssmall <=5k ev/s e2-medium 2/4GB | medium <=20k n2-standard-4 4/16GB | large >20k n2-standard-8 8/32GB%s\n' \
    "$C_DIM" "$C_RST"

  ask_choice MODE "Deployment mode" \
    "Fully self-hosted (this exact Docker stack on GCE)" \
    "Cloud-native managed (Pub/Sub, Dataflow, BigQuery, Cloud Run, GCS)" \
    "Managed lift-and-shift (Managed Kafka, Cloud SQL — same pipeline shape)"

  # Only modes 1 and 3 put VMs in the VPC; the cloud-native branch has nothing
  # to SSH to, so it skips the SSH/edge firewall rules and Cloud NAT entirely.
  case "$MODE_IDX" in 2) HAS_VMS=no ;; *) HAS_VMS=yes ;; esac

  if [ "$HAS_VMS" = yes ]; then
    CALLER_IP=$(my_ip)
    if [ -n "$CALLER_IP" ]; then
      ask_yesno LOCK_SSH "Restrict SSH + admin ports to your current IP ($CALLER_IP)?" y
    else
      warn "could not detect your public IP — SSH will be opened to the IAP range only"
      LOCK_SSH=no
    fi
    # The IAP range is always allowed: only the edge VM gets a public address,
    # so every other host is reachable *only* through an IAP tunnel — which is
    # what the wizard's own ssh/scp calls use. Authorisation there is IAM, not
    # source IP. Locking to the caller's IP narrows the direct path on top.
    if [ "$LOCK_SSH" = yes ]; then
      SSH_CIDR="$CALLER_IP/32,$IAP_CIDR"
    else
      SSH_CIDR="$IAP_CIDR"
      info "SSH allowed from Google's IAP range only — gcloud compute ssh --tunnel-through-iap"
    fi
  fi

  case "$MODE_IDX" in
    1) collect_self_hosted ;;
    2) collect_cloud_native ;;
    3) collect_managed ;;
  esac
}

collect_self_hosted() {
  ask_choice VM_COUNT_C "How many VMs?" \
    "1 — everything on one host, Kafka RF 1" \
    "3 — Kafka RF 3, roles split across hosts"
  if [ "$VM_COUNT_C_IDX" = 1 ]; then
    VM_COUNT=1; KAFKA_RF=1
  else
    VM_COUNT=3; KAFKA_RF=3
    info "vm1: kafka broker 1 + flink + app containers + Caddy (edge)"
    info "vm2: kafka broker 2 + clickhouse + Streamlit/Grafana"
    info "vm3: kafka broker 3 + postgres master data"
  fi

  ask DISK_GB "Boot disk per VM, GB (pd-balanced)" "$(tier_disk "$TIER")"
  case "$DISK_GB" in *[!0-9]*|'') die "disk size must be a whole number of GB" ;; esac

  ask BUCKET "GCS bucket for artifacts + backups (globally unique)" "$NAME-artifacts-$PROJECT"
  case "$BUCKET" in
    *[!a-z0-9-]*|-*|*-) die "bucket '$BUCKET' must be lowercase letters, digits, inner hyphens" ;;
  esac
}

collect_managed() {
  ask_secret CH_API_KEY "ClickHouse Cloud API key (blank = run ClickHouse on a small GCE VM)"
  if [ -n "$CH_API_KEY" ]; then CH_MODE=cloud; else CH_MODE=vm; fi
  ask BUCKET "GCS bucket for build artifacts (globally unique)" "$NAME-artifacts-$PROJECT"
  case "$BUCKET" in
    *[!a-z0-9-]*|-*|*-) die "bucket '$BUCKET' must be lowercase letters, digits, inner hyphens" ;;
  esac
  ask_yesno ALWAYS_ON "Keep the Kafka consumers warm (Cloud Run min-instances=1)?" y
}

collect_cloud_native() {
  ask DATASET "BigQuery dataset for the plant tables" "plant_risk"
  case "$DATASET" in *[!a-zA-Z0-9_]*|'') die "dataset '$DATASET' must be letters, digits, underscores" ;; esac
  ask BUCKET "GCS bucket for Dataflow staging + build artifacts (globally unique)" "$NAME-artifacts-$PROJECT"
  case "$BUCKET" in
    *[!a-z0-9-]*|-*|*-) die "bucket '$BUCKET' must be lowercase letters, digits, inner hyphens" ;;
  esac
  MAX_WORKERS=$(tier_max_workers "$TIER")
  ask MAX_WORKERS "Dataflow max workers (ceiling on autoscaling, and on spend)" "$MAX_WORKERS"
  case "$MAX_WORKERS" in *[!0-9]*|'') die "max workers must be a whole number" ;; esac
  ask_yesno ALWAYS_ON "Keep the Pub/Sub pull consumers warm (Cloud Run min-instances=1)?" y
  # The Streamlit dashboard speaks ClickHouse SQL end to end — argMax, TTLs,
  # LowCardinality. It runs on Cloud Run unchanged and every query fails until
  # someone ports it, so deploying it is opt-in and labelled, never implied.
  ask_yesno DEPLOY_DASH "Deploy the Streamlit dashboard? (its queries are ClickHouse SQL and NEED PORTING to BigQuery)" n
  # Same honesty rule as the dashboard: the engine, redrive, notifier and
  # ingest door are all confluent-kafka clients, and Pub/Sub speaks no Kafka
  # wire protocol. Deploying them unported gets a crash loop, not a pipeline.
  ask_yesno DEPLOY_CONSUMERS "Deploy the Kafka-client services (engine, redrive, notifier, ingest)? They NEED a Pub/Sub client port first" n
}

# ---- cloud-native topology --------------------------------------------------
# Pub/Sub topic IDs allow letters, digits, dashes, periods, underscores and
# tildes, so every dotted Kafka topic name in $TOPICS carries over verbatim —
# no mangling, and the two deployments stay diffable. (The one rule that bites:
# an ID may not start with "goog".)
#
# subscriptions: "<subscription-id> <topic>" — one per consumer per topic, so
# each service gets its own backlog and one slow consumer cannot starve another.
subscriptions() {
  cat <<EOF
$NAME-engine-readings plant.sensor.readings
$NAME-redrive-dlq plant.sensor.dlq
$NAME-notifier-alerts plant.risk.alerts
$NAME-sink-readings plant.sensor.readings
$NAME-sink-scores plant.risk.scores
$NAME-sink-alerts plant.risk.alerts
$NAME-sink-dlq plant.sensor.dlq
$NAME-sink-outcomes plant.sensor.dlq.outcomes
EOF
}

# BigQuery tables, translated from streaming/plant-risk/clickhouse/*.sql:
#   table|partition field|clustering fields|partition expiry (s)|schema
# Type mapping: DateTime64(3)->TIMESTAMP, Float32/64->FLOAT64, UInt16->INT64
# (BigQuery has no unsigned types), Bool->BOOL, LowCardinality(String)->STRING
# (BigQuery's columnar storage dictionary-encodes low-cardinality columns by
# itself, so the hint has no counterpart and needs none). The ClickHouse TTLs
# become partition expiries — same intent, and the only thing standing between
# a 5000 ev/s firehose and an unbounded BigQuery storage bill.
# The DLQ's `partition`/`offset` become source_partition/source_offset: both are
# reserved words in BigQuery SQL and would need backticking in every query, and
# on Pub/Sub there is no partition or offset to put in them anyway.
bq_tables() {
  cat <<'EOF'
sensor_readings|ts|equipment_id,sensor|259200|event_id:STRING,equipment_id:STRING,sensor:STRING,value:FLOAT64,unit:STRING,running:BOOL,ts:TIMESTAMP,ingested_at:TIMESTAMP
risk_scores|ts|equipment_id,risk_band|1209600|ts:TIMESTAMP,equipment_id:STRING,equipment_name:STRING,equipment_type:STRING,criticality:STRING,age_years:FLOAT64,risk_score:FLOAT64,risk_band:STRING,running:BOOL,top_sensor:STRING,top_sensor_severity:FLOAT64,open_alert_id:STRING,sensors:JSON,ingested_at:TIMESTAMP
alerts|ts|equipment_id,alert_id|2592000|ts:TIMESTAMP,alert_id:STRING,equipment_id:STRING,equipment_name:STRING,alert_type:STRING,status:STRING,risk_score:FLOAT64,risk_band:STRING,criticality:STRING,dominant_sensor:STRING,failure_mode:STRING,likely_cause:STRING,effect:STRING,rpn:INT64,recommended_action:STRING,note:STRING,ingested_at:TIMESTAMP
dlq|failed_at|stage,source_topic|1209600|failed_at:TIMESTAMP,stage:STRING,error:STRING,source_topic:STRING,source_partition:INT64,source_offset:INT64,raw:STRING,ingested_at:TIMESTAMP
dlq_redrive|ts|outcome,stage|1209600|ts:TIMESTAMP,outcome:STRING,reason:STRING,stage:STRING,error:STRING,equipment_id:STRING,sensor:STRING,ingested_at:TIMESTAMP
EOF
}

# Which subscription feeds which table. Consumed by bq-sink as $SINK_MAP.
SINK_MAP_VALUE() {
  printf '%s' "$NAME-sink-readings:sensor_readings,$NAME-sink-scores:risk_scores,$NAME-sink-alerts:alerts,$NAME-sink-dlq:dlq,$NAME-sink-outcomes:dlq_redrive"
}

# ---- phase 3: plan ----------------------------------------------------------
plan_network() {
  plan_add "${C_BOLD}Networking$C_RST"
  plan_add "VPC $NAME-vpc + subnet $NAME-subnet ($SUBNET_CIDR) in $REGION"
  plan_add "firewall $NAME-allow-internal — $SUBNET_CIDR, all service ports"
  if [ "$HAS_VMS" = yes ]; then
    plan_add "firewall $NAME-allow-web — 0.0.0.0/0 tcp:80,443, target tag 'edge' only"
    plan_add "firewall $NAME-allow-ssh — $SSH_CIDR tcp:22, target tag '$NAME-node'"
    plan_add "Cloud NAT $NAME-nat (egress for pulls; no VM gets a public IP except the edge)"
    plan_cost 3 "Cloud NAT gateway + 1 static egress IP"
  else
    plan_add "no SSH or edge rules — this deployment has no VMs to reach"
    plan_add "the VPC exists only so Cloud Run can reach Cloud SQL on a private IP"
  fi
}

plan_self_hosted() {
  plan_network
  local mt vmcost i
  mt=$(tier_machine "$TIER"); vmcost=$(tier_vm_cost "$TIER")
  plan_add ""
  plan_add "${C_BOLD}Compute — self-hosted ($VM_COUNT VM, Kafka RF $KAFKA_RF)$C_RST"
  i=1
  while [ "$i" -le "$VM_COUNT" ]; do
    plan_cost "$vmcost" "GCE $NAME-vm$i — $mt, Ubuntu 24.04 LTS, cloud-init docker"
    i=$((i + 1))
  done
  plan_cost $(( (DISK_GB * VM_COUNT) / 10 )) "$VM_COUNT x ${DISK_GB}GB pd-balanced boot disks"
  plan_add "docker compose profile 'plantrisk' + Caddy, .env generated on the host (mode 600)"
  plan_add ""
  plan_add "${C_BOLD}Kafka topics$C_RST (RF $KAFKA_RF, $PARTS partitions each)"
  plan_add "$(echo "$TOPICS" | tr ' ' ',')"
  plan_add ""
  plan_cost 2 "GCS bucket gs://$BUCKET (stack tarball, ClickHouse backups)"
}

plan_cloud_native() {
  plan_network
  local n t tbl part clust exp schema
  plan_add ""
  plan_add "${C_BOLD}Messaging — Pub/Sub replaces Kafka$C_RST"
  n=$(echo "$TOPICS" | wc -w | tr -d ' ')
  plan_add "$n topics, names carried over verbatim (dots are legal Pub/Sub IDs):"
  plan_add "  $(echo "$TOPICS" | tr ' ' ',')"
  plan_add "8 pull subscriptions — one per consumer per topic, 7-day retention, 60s ack deadline:"
  subscriptions | while read -r sub topic; do plan_add "  $sub <- $topic"; done
  plan_add "no partition count to choose: Pub/Sub autoscales, so $EPS ev/s changes nothing here"
  plan_cost 40 "Pub/Sub throughput + message retention at ~$EPS ev/s"

  plan_add ""
  plan_add "${C_BOLD}Stream processing — Dataflow replaces Flink$C_RST"
  plan_add "${C_YLW}PORT REQUIRED:${C_RST} streaming/jobs/*.py are PyFlink. Dataflow runs Apache Beam;"
  plan_add "  the two share no API. The wizard enables the API, creates the staging/temp"
  plan_add "  paths and prints the exact submit command — it does NOT deploy a job,"
  plan_add "  because there is no job to deploy until someone writes the Beam pipeline."
  plan_add "gs://$BUCKET/dataflow/{staging,temp} + max-workers $MAX_WORKERS (autoscaling ceiling)"
  plan_cost "$(tier_stream_cost "$TIER")" "Dataflow streaming workers, once the Beam job exists (up to $MAX_WORKERS workers)"

  plan_add ""
  plan_add "${C_BOLD}Analytics — BigQuery replaces ClickHouse$C_RST"
  plan_add "dataset $DATASET in $REGION, tables translated from plant-risk/clickhouse/*.sql:"
  bq_tables | while IFS='|' read -r tbl part clust exp schema; do
    plan_add "  $tbl — partition by DATE($part), cluster ($clust), expire partitions after $((exp / 86400))d"
  done
  plan_add "ClickHouse TTLs become partition expiries; MergeTree ORDER BY becomes clustering"
  plan_cost 30 "BigQuery storage + streaming inserts (queries billed on-demand, ~\$6/TiB scanned)"

  plan_add ""
  plan_add "${C_BOLD}Services — Cloud Run only, no VMs and no Caddy$C_RST"
  plan_add "Cloud Run serves HTTPS on a managed *.run.app certificate, so the TLS proxy"
  plan_add "  the self-hosted stack needs for that job has nothing left to do here."
  plan_add "Artifact Registry $NAME-images + Cloud Build for each image"
  plan_cost 15 "$NAME-bq-sink — Pub/Sub pull -> BigQuery, min-instances=1, --no-cpu-throttling"
  plan_add "  written for this deployment (self-hosting/gcp/bq-sink), it is the only"
  plan_add "  consumer that needs no porting; it covers ingestion until the Beam job lands"
  if [ "$DEPLOY_CONSUMERS" = yes ]; then
    if [ "$ALWAYS_ON" = yes ]; then
      plan_cost 40 "3 pull consumers (engine, redrive, notifier) at min-instances=1 + ingest"
      plan_add "  ${C_YLW}cost warning:${C_RST} min-instances=1 with --no-cpu-throttling bills continuously."
      plan_add "  It is not optional for a pull consumer: Cloud Run revokes CPU between requests,"
      plan_add "  which silently freezes the streaming pull rather than failing it."
    else
      plan_add "  consumers at min-instances=0 — they will not pull while idle; use only for demos"
    fi
    plan_add "  ${C_YLW}PORT REQUIRED:${C_RST} all four are confluent-kafka clients and Pub/Sub speaks"
    plan_add "  no Kafka wire protocol. They will crash-loop until ported to google-cloud-pubsub."
  else
    plan_add "engine / redrive / notifier / ingest: ${C_YLW}NOT deployed${C_RST} — Kafka clients, need a"
    plan_add "  Pub/Sub port first. Their subscriptions are created and waiting; the summary"
    plan_add "  lists the porting work. Re-run the wizard and answer yes once they are ported."
  fi
  if [ "$DEPLOY_DASH" = yes ]; then
    plan_cost 13 "$NAME-plant-dashboard (Streamlit) — ${C_YLW}queries need porting to BigQuery${C_RST}"
  else
    plan_add "Streamlit dashboard: not deployed. Looker Studio over $DATASET is the zero-code"
    plan_add "  alternative and needs no porting at all."
  fi

  plan_add ""
  plan_cost "$(tier_sql_cost "$TIER")" "Cloud SQL PostgreSQL 16 $NAME-pg — $(tier_sql "$TIER"), private IP (plant master data, unchanged)"
  plan_cost 2 "GCS bucket gs://$BUCKET + Secret Manager (pg password, ingest key)"
}

plan_managed() {
  plan_network
  local kc km
  kc=$(tier_kafka_cpu "$TIER"); km=$(tier_kafka_mem "$TIER")
  plan_add ""
  plan_add "${C_BOLD}Managed services$C_RST"
  plan_cost "$(tier_kafka_cost "$TIER")" "Managed Service for Apache Kafka $NAME-kafka — ${kc} vCPU / ${km} GiB, 3 zones (RF 3 fixed)"
  plan_add "  topics: $PARTS partitions each — $(echo "$TOPICS" | tr ' ' ',')"
  plan_cost "$(tier_sql_cost "$TIER")" "Cloud SQL PostgreSQL 16 $NAME-pg — $(tier_sql "$TIER"), PRIVATE IP only via Service Networking"
  plan_add "  private IP needs a /24 VPC peering range ($NAME-psa) — created first, it cannot be added later without downtime"

  # Flink is the honest gap in GCP's managed story — so it lands on a VM in
  # both modes, and the plan says why rather than hiding it.
  plan_cost 27 "GCE $NAME-flink — e2-medium, Flink 1.20 jobmanager+taskmanager in Docker"
  plan_add "  ${C_YLW}why a VM:${C_RST} Cloud Run cannot host a stateful long-lived JobManager/TaskManager pair"
  plan_add "  (they register over RPC and outlive any request), and BigQuery Engine for Apache Flink is"
  plan_add "  limited-availability with no way to submit an arbitrary PyFlink job from a script"

  if [ "$CH_MODE" = cloud ]; then
    plan_add "ClickHouse Cloud service (billed on your ClickHouse account, key stored in Secret Manager)"
  else
    plan_cost 27 "GCE $NAME-clickhouse — e2-medium, ClickHouse 26.7 in Docker, private IP"
  fi

  plan_add ""
  plan_add "${C_BOLD}Consumers — Cloud Run (images built by Cloud Build)$C_RST"
  plan_add "Artifact Registry repo $NAME-images ($REGION-docker.pkg.dev/$PROJECT/$NAME-images)"
  local svc
  for svc in plant-risk-engine plant-dlq-redrive plant-alert-notifier plant-ingest plant-dashboard; do
    plan_add "  gcloud builds submit streaming/... -> $svc:latest -> Cloud Run $NAME-$svc"
  done
  if [ "$ALWAYS_ON" = yes ]; then
    plan_cost 40 "3 always-on Kafka consumers at min-instances=1 (engine, redrive, notifier)"
    plan_add "  ${C_YLW}cost warning:${C_RST} min-instances=1 bills continuously. Kafka consumers must stay resident —"
    plan_add "  scale-to-zero drops the consumer group and rebalances on every cold start."
  else
    plan_add "  min-instances=0 — cheap, but expect consumer-group rebalances and lag spikes"
  fi
  plan_cost 13 "Grafana OSS on Cloud Run ($NAME-grafana, min-instances=1, ClickHouse plugin)"
  plan_add "  GCP has no managed Grafana (unlike AWS/Azure); OSS on Cloud Run keeps it off the Flink VM,"
  plan_add "  at the cost of a stateless Grafana — all dashboards/datasources come from provisioning files"
  plan_add ""
  plan_cost 2 "GCS bucket gs://$BUCKET + Secret Manager secrets (pg, clickhouse, grafana, ingest key)"
}

# ---- phase 4: execution -----------------------------------------------------
enable_apis() {
  info "enabling required APIs (idempotent, slow the first time)"
  run gcloud services enable "$@" --project="$PROJECT"
}

create_network() {
  info "creating VPC and firewall rules"
  run gcloud compute networks create "$NAME-vpc" --project="$PROJECT" \
    --subnet-mode=custom
  run gcloud compute networks subnets create "$NAME-subnet" --project="$PROJECT" \
    --network="$NAME-vpc" --region="$REGION" --range="$SUBNET_CIDR" \
    --enable-private-ip-google-access

  run gcloud compute firewall-rules create "$NAME-allow-internal" --project="$PROJECT" \
    --network="$NAME-vpc" --direction=INGRESS --priority=1000 \
    --source-ranges="$SUBNET_CIDR" --allow=tcp:0-65535,udp:0-65535,icmp

  # Everything below exists to serve VMs. With no VMs there is no SSH surface,
  # no edge host and no egress to NAT — Cloud Run brings its own.
  [ "$HAS_VMS" = yes ] || return 0

  # The only rule with an internet source, and it is tag-scoped: a VM without
  # the 'edge' tag cannot be reached from outside no matter what it publishes.
  run gcloud compute firewall-rules create "$NAME-allow-web" --project="$PROJECT" \
    --network="$NAME-vpc" --direction=INGRESS --priority=1000 \
    --source-ranges=0.0.0.0/0 --target-tags=edge --allow=tcp:80,tcp:443

  run gcloud compute firewall-rules create "$NAME-allow-ssh" --project="$PROJECT" \
    --network="$NAME-vpc" --direction=INGRESS --priority=1000 \
    --source-ranges="$SSH_CIDR" --target-tags="$NAME-node" --allow=tcp:22

  run gcloud compute routers create "$NAME-router" --project="$PROJECT" \
    --network="$NAME-vpc" --region="$REGION"
  run gcloud compute routers nats create "$NAME-nat" --project="$PROJECT" \
    --router="$NAME-router" --region="$REGION" \
    --auto-allocate-nat-external-ips --nat-all-subnet-ip-ranges
}

create_bucket() {
  run gcloud storage buckets create "gs://$BUCKET" --project="$PROJECT" \
    --location="$REGION" --uniform-bucket-level-access \
    --public-access-prevention
}

# vm_create NAME MACHINE TAGS
vm_create() {
  local vm=$1 machine=$2 tags=$3 addr="--no-address"
  # Only the Caddy host gets a public address; the rest egress through Cloud
  # NAT and are reachable solely over IAP. Unquoted on purpose — an empty
  # "$addr" would be passed to gcloud as an empty argument.
  case "$tags" in *edge*) addr="" ;; esac
  run gcloud compute instances create "$vm" --project="$PROJECT" --zone="$ZONE" \
    --machine-type="$machine" $addr \
    --image-family=ubuntu-2404-lts-amd64 --image-project=ubuntu-os-cloud \
    --boot-disk-size="${DISK_GB:-50}GB" --boot-disk-type=pd-balanced \
    --subnet="$NAME-subnet" --tags="$tags" \
    --labels="deployment=$NAME" \
    --metadata-from-file="user-data=$SCRIPT_DIR/cloud-init.yaml" \
    --shielded-secure-boot --shielded-vtpm --shielded-integrity-monitoring
}

# Poll until cloud-init has finished — scp'ing before /opt/plant exists is the
# single most common way this deploy fails, and it fails silently.
wait_for_vm() {
  local vm=$1 tries=0
  [ "$DRY_RUN" = yes ] && { printf '%s  $ # poll: gcloud compute ssh %s -- test -f /opt/plant/.cloud-init-done%s\n' "$C_DIM" "$vm" "$C_RST"; return; }
  info "waiting for $vm to finish cloud-init (up to 5 min)"
  while [ "$tries" -lt 30 ]; do
    if gcloud compute ssh "$vm" --project="$PROJECT" --zone="$ZONE" --tunnel-through-iap \
         --command='test -f /opt/plant/.cloud-init-done' >/dev/null 2>&1; then
      ok "$vm ready"; return
    fi
    tries=$((tries + 1)); sleep 10
  done
  die "$vm never reported ready — check: gcloud compute instances get-serial-port-output $vm --zone=$ZONE"
}

vm_ssh() {  # vm_ssh VM "shell command"
  run gcloud compute ssh "$1" --project="$PROJECT" --zone="$ZONE" --tunnel-through-iap \
    --command="$2"
}

deploy_self_hosted() {
  enable_apis compute.googleapis.com iap.googleapis.com storage.googleapis.com \
    secretmanager.googleapis.com
  create_network
  create_bucket

  local mt i tags
  mt=$(tier_machine "$TIER")
  i=1
  while [ "$i" -le "$VM_COUNT" ]; do
    # Only vm1 carries the 'edge' tag; it runs Caddy and is the sole host with
    # anything reachable from the internet.
    tags="$NAME-node"
    [ "$i" = 1 ] && tags="$NAME-node,edge"
    vm_create "$NAME-vm$i" "$mt" "$tags"
    i=$((i + 1))
  done
  i=1
  while [ "$i" -le "$VM_COUNT" ]; do wait_for_vm "$NAME-vm$i"; i=$((i + 1)); done

  info "packaging streaming/ and copying it up"
  local tarball="$SCRIPT_DIR/.stack.tgz"
  run tar -czf "$tarball" -C "$REPO_ROOT" \
    --exclude='.env' --exclude='__pycache__' streaming
  # Not wrapped in run(): a dry run must not leave a file full of real
  # generated secrets behind, since the rm at the end would not execute.
  if [ "$DRY_RUN" = yes ]; then
    printf '%s  $ # write_stack_env %s/.env.%s %s%s\n' "$C_DIM" "$SCRIPT_DIR" "$NAME" "$EPS" "$C_RST"
  else
    write_stack_env "$SCRIPT_DIR/.env.$NAME" "$EPS"
  fi

  i=1
  while [ "$i" -le "$VM_COUNT" ]; do
    run gcloud compute scp "$tarball" "$SCRIPT_DIR/.env.$NAME" \
      "$NAME-vm$i:~/" --project="$PROJECT" --zone="$ZONE" --tunnel-through-iap
    vm_ssh "$NAME-vm$i" "sudo tar -xzf ~/.stack.tgz -C /opt/plant --strip-components=1 && sudo mv ~/.env.$NAME /opt/plant/.env && sudo chmod 600 /opt/plant/.env && sudo chown -R plant:docker /opt/plant"
    i=$((i + 1))
  done
  run rm -f "$tarball" "$SCRIPT_DIR/.env.$NAME"

  # Compose needs the external airflow_default network that the reference box
  # already has; create it here so the stack comes up on a fresh host.
  info "bringing the stack up (first build pulls ~3 GB of images)"
  vm_ssh "$NAME-vm1" "sudo docker network create airflow_default 2>/dev/null; cd /opt/plant && sudo docker compose --profile plantrisk up -d --build"
  if [ "$VM_COUNT" = 3 ]; then
    vm_ssh "$NAME-vm2" "cd /opt/plant && sudo docker compose up -d --build clickhouse plant-dashboard grafana"
    vm_ssh "$NAME-vm3" "cd /opt/plant && sudo docker compose --profile plantrisk up -d --build plant-postgres"
  fi

  create_topics_self_hosted
  write_state "self-hosted"
  summary_self_hosted
}

create_topics_self_hosted() {
  info "creating Kafka topics (RF $KAFKA_RF, $PARTS partitions)"
  local t
  for t in $TOPICS; do
    vm_ssh "$NAME-vm1" "sudo docker exec kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --create --if-not-exists --topic $t --partitions $PARTS --replication-factor $KAFKA_RF"
  done
}

# Postgres master data is unchanged in both managed branches, so this is shared.
create_cloud_sql() {
  info "Cloud SQL with a private IP — the peering range must exist first"
  run gcloud compute addresses create "$NAME-psa" --project="$PROJECT" \
    --global --purpose=VPC_PEERING --prefix-length=24 --network="$NAME-vpc"
  run gcloud services vpc-peerings connect --project="$PROJECT" \
    --service=servicenetworking.googleapis.com --ranges="$NAME-psa" --network="$NAME-vpc"
  # --no-assign-ip is not reversible without recreating the instance, which is
  # exactly why the peering is set up before the instance and not after.
  run gcloud sql instances create "$NAME-pg" --project="$PROJECT" \
    --database-version=POSTGRES_16 --tier="$(tier_sql "$TIER")" --region="$REGION" \
    --network="projects/$PROJECT/global/networks/$NAME-vpc" --no-assign-ip \
    --storage-type=SSD --storage-auto-increase --labels="deployment=$NAME"
  local pg_pw; pg_pw=$(new_password)
  if [ "$DRY_RUN" = yes ]; then
    printf '%s  $ gcloud sql users create plant --instance=%s --password=<generated>%s\n' "$C_DIM" "$NAME-pg" "$C_RST"
  else
    gcloud sql users create plant --project="$PROJECT" --instance="$NAME-pg" --password="$pg_pw"
  fi
  run gcloud sql databases create plant_ops --project="$PROJECT" --instance="$NAME-pg"
  create_secret "$NAME-pg-password" "$pg_pw"
}

deploy_managed() {
  enable_apis compute.googleapis.com iap.googleapis.com storage.googleapis.com \
    managedkafka.googleapis.com sqladmin.googleapis.com servicenetworking.googleapis.com \
    run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
    secretmanager.googleapis.com vpcaccess.googleapis.com
  create_network
  create_bucket

  info "creating Managed Service for Apache Kafka cluster (10-20 min)"
  run gcloud managed-kafka clusters create "$NAME-kafka" --project="$PROJECT" \
    --location="$REGION" --labels="deployment=$NAME" \
    --cpu="$(tier_kafka_cpu "$TIER")" --memory="$(tier_kafka_mem "$TIER")GiB" \
    --subnets="projects/$PROJECT/regions/$REGION/subnetworks/$NAME-subnet" \
    --auto-rebalance
  local t
  for t in $TOPICS; do
    # RF 3 is fixed by the service — it spreads brokers over three zones and
    # rejects any lower factor, so partitions_for_tier is the only knob here.
    run gcloud managed-kafka topics create "$t" --project="$PROJECT" \
      --location="$REGION" --cluster="$NAME-kafka" \
      --partitions="$PARTS" --replication-factor=3
  done

  create_cloud_sql

  info "Flink on a GCE VM (see the plan for why it is not Cloud Run)"
  DISK_GB=50
  vm_create "$NAME-flink" e2-medium "$NAME-node"
  wait_for_vm "$NAME-flink"
  run gcloud compute scp --recurse "$REPO_ROOT/streaming/flink" "$REPO_ROOT/streaming/jobs" \
    "$NAME-flink:~/" --project="$PROJECT" --zone="$ZONE" --tunnel-through-iap

  if [ "$CH_MODE" = cloud ]; then
    create_secret "$NAME-clickhouse-api-key" "$CH_API_KEY"
    info "ClickHouse Cloud key stored — create the service in the ClickHouse console in $REGION and point CLICKHOUSE_URL at it"
  else
    vm_create "$NAME-clickhouse" e2-medium "$NAME-node"
    wait_for_vm "$NAME-clickhouse"
    vm_ssh "$NAME-clickhouse" "sudo docker run -d --name clickhouse --restart unless-stopped --ulimit nofile=262144:262144 -p 8123:8123 -p 9000:9000 clickhouse/clickhouse-server:26.7"
  fi
  create_secret "$NAME-clickhouse-viewer-password" "$(new_password)"
  create_secret "$NAME-grafana-admin-password" "$(new_password)"
  create_secret "$NAME-ingest-api-key" "$(new_password)"

  info "building consumer images and deploying to Cloud Run"
  run gcloud artifacts repositories create "$NAME-images" --project="$PROJECT" \
    --repository-format=docker --location="$REGION" --labels="deployment=$NAME"
  local registry="$REGION-docker.pkg.dev/$PROJECT/$NAME-images"
  local min_inst=0
  [ "$ALWAYS_ON" = yes ] && min_inst=1

  local svc src
  for svc in plant-risk-engine plant-dlq-redrive plant-alert-notifier plant-ingest plant-dashboard; do
    case "$svc" in
      plant-risk-engine)    src="$REPO_ROOT/streaming/plant-risk/risk-engine" ;;
      plant-dlq-redrive)    src="$REPO_ROOT/streaming/plant-risk/redrive" ;;
      plant-alert-notifier) src="$REPO_ROOT/streaming/plant-risk/notifier" ;;
      plant-ingest)         src="$REPO_ROOT/streaming/plant-risk/ingest" ;;
      plant-dashboard)      src="$REPO_ROOT/streaming/dashboard" ;;
    esac
    run gcloud builds submit "$src" --project="$PROJECT" --tag="$registry/$svc:latest"
    # plant-ingest and plant-dashboard serve HTTP and may scale to zero; the
    # three Kafka consumers must not, or the group rebalances on every start.
    local this_min="$min_inst"
    case "$svc" in plant-ingest|plant-dashboard) this_min=0 ;; esac
    run gcloud run deploy "$NAME-$svc" --project="$PROJECT" --region="$REGION" \
      --image="$registry/$svc:latest" --labels="deployment=$NAME" \
      --network="$NAME-vpc" --subnet="$NAME-subnet" --vpc-egress=private-ranges-only \
      --min-instances="$this_min" --no-allow-unauthenticated \
      --set-secrets="PLANT_PG_PASSWORD=$NAME-pg-password:latest,CLICKHOUSE_VIEWER_PASSWORD=$NAME-clickhouse-viewer-password:latest,INGEST_API_KEY=$NAME-ingest-api-key:latest"
  done

  run gcloud run deploy "$NAME-grafana" --project="$PROJECT" --region="$REGION" \
    --image=grafana/grafana-oss:12.4.3 --labels="deployment=$NAME" \
    --network="$NAME-vpc" --subnet="$NAME-subnet" --vpc-egress=private-ranges-only \
    --min-instances=1 --port=3000 --no-allow-unauthenticated \
    --set-env-vars=GF_INSTALL_PLUGINS=grafana-clickhouse-datasource,GF_USERS_ALLOW_SIGN_UP=false \
    --set-secrets="GF_SECURITY_ADMIN_PASSWORD=$NAME-grafana-admin-password:latest"

  write_state "lift-and-shift"
  summary_managed
}

deploy_cloud_native() {
  enable_apis compute.googleapis.com storage.googleapis.com pubsub.googleapis.com \
    dataflow.googleapis.com bigquery.googleapis.com sqladmin.googleapis.com \
    servicenetworking.googleapis.com run.googleapis.com cloudbuild.googleapis.com \
    artifactregistry.googleapis.com secretmanager.googleapis.com
  create_network
  create_bucket

  info "Pub/Sub topics"
  local t
  for t in $TOPICS; do
    run gcloud pubsub topics create "$t" --project="$PROJECT" --labels="deployment=$NAME"
  done
  # No --dead-letter-topic: Pub/Sub's dead lettering catches *delivery* failures
  # (n nacks), while plant.sensor.dlq carries *validation* failures the engine
  # decided about. Wiring one to the other would mix two different signals.
  info "Pub/Sub subscriptions (pull, 60s ack deadline, 7-day retention)"
  subscriptions | while read -r sub topic; do
    run gcloud pubsub subscriptions create "$sub" --project="$PROJECT" \
      --topic="$topic" --ack-deadline=60 --message-retention-duration=7d \
      --labels="deployment=$NAME"
  done

  info "BigQuery dataset $DATASET and 5 tables"
  run bq --project_id="$PROJECT" --location="$REGION" mk --dataset \
    --label="deployment:$NAME" "$PROJECT:$DATASET"
  bq_tables | while IFS='|' read -r tbl part clust exp schema; do
    run bq --project_id="$PROJECT" --location="$REGION" mk --table \
      --time_partitioning_field="$part" --time_partitioning_type=DAY \
      --time_partitioning_expiration="$exp" --clustering_fields="$clust" \
      "$PROJECT:$DATASET.$tbl" "$schema"
  done

  info "Dataflow staging paths (the job itself is yours to write — see the summary)"
  run gcloud storage cp /dev/null "gs://$BUCKET/dataflow/staging/.keep"
  run gcloud storage cp /dev/null "gs://$BUCKET/dataflow/temp/.keep"

  create_cloud_sql
  create_secret "$NAME-ingest-api-key" "$(new_password)"

  # One service account for every Cloud Run service, granted exactly the four
  # roles this pipeline needs. The default compute SA would work and is Editor
  # on the whole project — which is why it is not used here.
  info "runtime service account and IAM"
  local sa="$NAME-run@$PROJECT.iam.gserviceaccount.com"
  run gcloud iam service-accounts create "$NAME-run" --project="$PROJECT" \
    --display-name="$NAME Cloud Run runtime"
  local role
  for role in roles/pubsub.subscriber roles/pubsub.publisher \
              roles/bigquery.dataEditor roles/secretmanager.secretAccessor; do
    run gcloud projects add-iam-policy-binding "$PROJECT" \
      --member="serviceAccount:$sa" --role="$role" --condition=None
  done

  info "building and deploying Cloud Run services"
  run gcloud artifacts repositories create "$NAME-images" --project="$PROJECT" \
    --repository-format=docker --location="$REGION" --labels="deployment=$NAME"
  local registry="$REGION-docker.pkg.dev/$PROJECT/$NAME-images"

  run gcloud builds submit "$SCRIPT_DIR/bq-sink" --project="$PROJECT" \
    --tag="$registry/bq-sink:latest"
  # ^@^ swaps the delimiter: SINK_MAP is itself a comma-separated list, and the
  # default comma delimiter would split it into nonsense env vars.
  # --no-cpu-throttling is mandatory, not tuning: Cloud Run revokes CPU between
  # requests, which freezes the streaming pull instead of failing it loudly.
  run gcloud run deploy "$NAME-bq-sink" --project="$PROJECT" --region="$REGION" \
    --image="$registry/bq-sink:latest" --labels="deployment=$NAME" \
    --service-account="$sa" --min-instances=1 --no-cpu-throttling \
    --no-allow-unauthenticated \
    --set-env-vars="^@^GCP_PROJECT=$PROJECT@BQ_DATASET=$DATASET@SINK_MAP=$(SINK_MAP_VALUE)"

  local min_inst=0
  [ "$ALWAYS_ON" = yes ] && min_inst=1
  if [ "$DEPLOY_CONSUMERS" = yes ]; then
    warn "deploying Kafka-client services unported — they will crash-loop until they speak Pub/Sub"
    local svc src this_min auth cpu
    for svc in plant-risk-engine plant-dlq-redrive plant-alert-notifier plant-ingest; do
      case "$svc" in
        plant-risk-engine)    src="$REPO_ROOT/streaming/plant-risk/risk-engine" ;;
        plant-dlq-redrive)    src="$REPO_ROOT/streaming/plant-risk/redrive" ;;
        plant-alert-notifier) src="$REPO_ROOT/streaming/plant-risk/notifier" ;;
        plant-ingest)         src="$REPO_ROOT/streaming/plant-risk/ingest" ;;
      esac
      run gcloud builds submit "$src" --project="$PROJECT" --tag="$registry/$svc:latest"
      # The ingest door is meant to be public and does its own API-key check;
      # it is request-driven, so it scales to zero and lets Cloud Run throttle
      # its CPU. The pull consumers serve nobody, stay IAM-locked, and need CPU
      # between requests or their subscriber threads stall.
      this_min="$min_inst"; auth="--no-allow-unauthenticated"; cpu="--no-cpu-throttling"
      case "$svc" in
        plant-ingest) this_min=0; auth="--allow-unauthenticated"; cpu="--cpu-throttling" ;;
      esac
      run gcloud run deploy "$NAME-$svc" --project="$PROJECT" --region="$REGION" \
        --image="$registry/$svc:latest" --labels="deployment=$NAME" \
        --service-account="$sa" --network="$NAME-vpc" --subnet="$NAME-subnet" \
        --vpc-egress=private-ranges-only --min-instances="$this_min" \
        "$cpu" "$auth" \
        --set-secrets="PLANT_PG_PASSWORD=$NAME-pg-password:latest,INGEST_API_KEY=$NAME-ingest-api-key:latest"
    done
  fi

  if [ "$DEPLOY_DASH" = yes ]; then
    run gcloud builds submit "$REPO_ROOT/streaming/dashboard" --project="$PROJECT" \
      --tag="$registry/plant-dashboard:latest"
    # IAM-authenticated, not public: Caddy used to supply basic auth in front of
    # Streamlit, and Streamlit itself has none.
    run gcloud run deploy "$NAME-plant-dashboard" --project="$PROJECT" --region="$REGION" \
      --image="$registry/plant-dashboard:latest" --labels="deployment=$NAME" \
      --service-account="$sa" --network="$NAME-vpc" --subnet="$NAME-subnet" \
      --vpc-egress=private-ranges-only --port=8501 --no-allow-unauthenticated \
      --set-secrets="PLANT_PG_PASSWORD=$NAME-pg-password:latest"
  fi

  write_state "cloud-native"
  summary_cloud_native
}

# ---- state + summary --------------------------------------------------------
write_state() {
  local dir="$SCRIPT_DIR/state/$NAME"
  if [ "$DRY_RUN" = yes ]; then
    info "would write $dir/state.env (mode $1)"
    return
  fi
  mkdir -p "$dir"
  umask 077
  cat >"$dir/state.env" <<EOF
# Written by deploy.sh — teardown.sh reads this. Do not commit.
NAME=$NAME
MODE=$1
PROJECT=$PROJECT
REGION=$REGION
ZONE=$ZONE
TIER=$TIER
EPS=$EPS
VM_COUNT=${VM_COUNT:-0}
HAS_VMS=$HAS_VMS
BUCKET=$BUCKET
CH_MODE=${CH_MODE:-}
DATASET=${DATASET:-}
MAX_WORKERS=${MAX_WORKERS:-}
CREATED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
EOF
  ok "state written to $dir/state.env"
}

summary_self_hosted() {
  banner "Deployed — $NAME ($TIER tier, $VM_COUNT VM, $REGION/$ZONE)"
  cat <<EOF
Public (vm1 only, via Caddy on 80/443):
  https://<vm1-external-ip>.sslip.io           Streamlit dashboard (basic auth)
  https://ingest.<vm1-external-ip>.sslip.io    plant-ingest FastAPI door

Everything else stays on 127.0.0.1. Tunnel to it:

  gcloud compute ssh $NAME-vm1 --project=$PROJECT --zone=$ZONE --tunnel-through-iap -- -N \\
    -L 8081:127.0.0.1:8081 \\
    -L 8082:127.0.0.1:8082 \\
    -L 8123:127.0.0.1:8123 \\
    -L 3000:127.0.0.1:3000 \\
    -L 29092:127.0.0.1:29092

  localhost:8081   Kafka UI          localhost:8082   Flink dashboard
  localhost:8123   ClickHouse HTTP   localhost:3000   Grafana
  localhost:29092  Kafka bootstrap for laptop clients

Secrets:  /opt/plant/.env on each VM (mode 600, generated — never printed here)
Topics:   $PARTS partitions, RF $KAFKA_RF
Artifacts: gs://$BUCKET

Next:
  1. Point DNS (or keep sslip.io) and set the Caddy site addresses in /opt/plant/caddy/Caddyfile
  2. Load the ClickHouse schema:  sudo docker exec -i clickhouse clickhouse-client < clickhouse/*.sql
  3. Submit the Flink job:        sudo docker exec flink-jobmanager flink run -py /opt/flink/jobs/plant_risk_shadow.py
  4. Tear it all down:            bash $SCRIPT_DIR/teardown.sh $NAME
EOF
}

summary_cloud_native() {
  banner "Deployed — $NAME (cloud-native, $TIER tier, $REGION)"
  cat <<EOF
Messaging:  Pub/Sub, $(echo "$TOPICS" | wc -w | tr -d ' ') topics + 8 pull subscriptions (names identical to the Kafka build)
Analytics:  BigQuery $PROJECT:$DATASET — sensor_readings, risk_scores, alerts, dlq, dlq_redrive
Ingestion:  Cloud Run $NAME-bq-sink (Pub/Sub pull -> BigQuery streaming insert, min-instances=1)
Postgres:   $NAME-pg (Cloud SQL 16, private IP — the one piece that did not change)
Secrets:    Secret Manager: $NAME-pg-password, $NAME-ingest-api-key
Identity:   $NAME-run@$PROJECT.iam.gserviceaccount.com (pubsub + bigquery + secrets, nothing else)
Staging:    gs://$BUCKET/dataflow/{staging,temp}

No VMs, no Caddy, no TLS to manage: every Cloud Run service is served over
HTTPS on a Google-managed *.run.app certificate. Public surface is the ingest
door only (it authenticates with its own API key); everything else is IAM.
Reach an internal service with:  gcloud run services proxy <svc> --region=$REGION

${C_YLW}Still to do — the parts that need real work, not more gcloud:${C_RST}

  1. Port the PyFlink jobs to Apache Beam. Dataflow does not run Flink jobs.
     streaming/jobs/plant_risk_shadow.py is the one that matters. Then:

       python -m plant_risk_beam \\
         --runner=DataflowRunner \\
         --project=$PROJECT \\
         --region=$REGION \\
         --job_name=$NAME-risk \\
         --streaming \\
         --enable_streaming_engine \\
         --max_num_workers=$MAX_WORKERS \\
         --staging_location=gs://$BUCKET/dataflow/staging \\
         --temp_location=gs://$BUCKET/dataflow/temp \\
         --service_account_email=$NAME-run@$PROJECT.iam.gserviceaccount.com \\
         --input_subscription=projects/$PROJECT/subscriptions/$NAME-engine-readings \\
         --output_table=$PROJECT:$DATASET.risk_scores

  2. Port the engine / redrive / notifier / ingest from confluent-kafka to
     google-cloud-pubsub.$(if [ "$DEPLOY_CONSUMERS" = yes ]; then echo " They are deployed and crash-looping until you do."; else echo " They are NOT deployed — see the plan."; fi)
  3. Dashboards: Looker Studio straight over $PROJECT:$DATASET needs no code at
     all and is the fastest way to see data.$(if [ "$DEPLOY_DASH" = yes ]; then echo " The Streamlit service is deployed but every query is ClickHouse SQL and will fail."; fi)
  4. Watch the bill: BigQuery streaming inserts and Dataflow workers are the two
     lines that scale with traffic. Partition expiries are already set.
  5. Tear it all down:  bash $SCRIPT_DIR/teardown.sh $NAME
EOF
}

summary_managed() {
  banner "Deployed — $NAME (lift-and-shift, $TIER tier, $REGION)"
  cat <<EOF
Kafka:      $NAME-kafka (Managed Service for Apache Kafka, RF 3, $PARTS partitions/topic)
            bootstrap: bootstrap.$NAME-kafka.$REGION.managedkafka.$PROJECT.cloud.goog:9092
Postgres:   $NAME-pg (Cloud SQL 16, PRIVATE IP only — reachable from the VPC, not the internet)
Flink:      $NAME-flink GCE VM — Cloud Run cannot host a stateful JobManager/TaskManager
ClickHouse: $(if [ "$CH_MODE" = cloud ]; then echo "ClickHouse Cloud (create the service, then set CLICKHOUSE_URL on the Cloud Run services)"; else echo "$NAME-clickhouse GCE VM, private IP"; fi)
Consumers:  Cloud Run $NAME-plant-{risk-engine,dlq-redrive,alert-notifier,ingest,dashboard}
Grafana:    Cloud Run $NAME-grafana (stateless — dashboards come from provisioning files)
Secrets:    Secret Manager: $NAME-{pg-password,clickhouse-viewer-password,grafana-admin-password,ingest-api-key}

Nothing is public: every Cloud Run service is --no-allow-unauthenticated.
Reach them with:  gcloud run services proxy $NAME-plant-dashboard --region=$REGION

Next:
  1. Grant the Cloud Run service account roles/managedkafka.client and secretmanager.secretAccessor
  2. Load the ClickHouse schema and submit the Flink job on $NAME-flink
  3. Tear it all down:  bash $SCRIPT_DIR/teardown.sh $NAME
EOF
}

# ---- main -------------------------------------------------------------------
preflight
collect_prefs

case "$MODE_IDX" in
  1) plan_self_hosted ;;
  2) plan_cloud_native ;;
  3) plan_managed ;;
esac
plan_add ""
plan_add "${C_BOLD}Estimated total: ~\$$COST_TOTAL/month${C_RST} (list price, $REGION, excludes egress, BigQuery query scans and ClickHouse Cloud)"
plan_show

if [ "$DRY_RUN" = yes ]; then
  banner "--dry-run — the commands below would run"
fi
plan_confirm

case "$MODE_IDX" in
  1) deploy_self_hosted ;;
  2) deploy_cloud_native ;;
  3) deploy_managed ;;
esac
