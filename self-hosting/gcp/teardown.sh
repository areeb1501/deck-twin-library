#!/usr/bin/env bash
# Delete everything deploy.sh created for one named deployment.
#
#   bash teardown.sh <name> [--dry-run]
#
# Reads state/<name>/state.env for the project/region/mode, then deletes by the
# label filter deployment=<name> wherever gcloud supports labels, and by name
# where it does not (firewall rules, subnets, VPCs and NAT configs are not
# labellable). Order matters: dependents before their networks, or every delete
# fails with "resource in use".
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=../lib/common.sh
. "$SCRIPT_DIR/../lib/common.sh"

NAME=""; DRY_RUN=no
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=yes ;;
    -h|--help) printf 'usage: %s <deployment-name> [--dry-run]\n' "$0"; exit 0 ;;
    -*) die "unknown flag '$arg'" ;;
    *) NAME="$arg" ;;
  esac
done
[ -n "$NAME" ] || die "usage: $0 <deployment-name> [--dry-run]"

STATE="$SCRIPT_DIR/state/$NAME/state.env"
[ -f "$STATE" ] || die "no state file at $STATE — nothing to tear down (or it was deployed elsewhere)"
# shellcheck source=/dev/null
. "$STATE"

run() {
  if [ "$DRY_RUN" = yes ]; then
    printf '%s  $' "$C_DIM"; printf ' %q' "$@"; printf '%s\n' "$C_RST"
  else
    "$@"
  fi
}

# Deletes are best-effort: a resource the deploy never got to should not stop
# the teardown of the ones it did create.
try() { run "$@" || warn "failed (continuing): $*"; }

# List resource names carrying our label, so teardown never guesses at names.
# Read-only, so unlike the deletes it runs for real even under --dry-run.
by_label() {  # by_label <gcloud group...> — echoes names, one per line
  gcloud "$@" --project="$PROJECT" --filter="labels.deployment=$NAME" \
    --format='value(name)' 2>/dev/null || true
}

banner "Teardown — $NAME"
cat <<EOF
  project     $PROJECT
  mode        $MODE
  region/zone $REGION / $ZONE
  created     $CREATED_AT

This deletes:
$(if [ "$MODE" = cloud-native ]; then
    echo "  every Pub/Sub topic and subscription, the BigQuery dataset $DATASET AND ALL ITS
  TABLES, the Cloud Run services, the Cloud SQL instance (and its data),"
  else
    echo "  the VMs and their disks — which is where Kafka's log and ClickHouse's data live,"
    [ "$MODE" = lift-and-shift ] && echo "  the Managed Kafka cluster and all its topics, the Cloud SQL instance (and its data),"
  fi)
  the GCS bucket gs://$BUCKET and everything in it, and the VPC.
Data is not recoverable.
EOF

read -r -p "$(printf '%sType the deployment name %s%s%s to confirm:%s ' "$C_BOLD" "$C_YLW" "$NAME" "$C_RST$C_BOLD" "$C_RST")" reply
[ "$reply" = "$NAME" ] || die "aborted — nothing was deleted"

if [ "$MODE" != self-hosted ]; then
  info "Cloud Run services"
  for svc in $(by_label run services list --region="$REGION"); do
    try gcloud run services delete "$svc" --project="$PROJECT" --region="$REGION" --quiet
  done
fi

if [ "$MODE" = cloud-native ]; then
  # Subscriptions before topics: deleting a topic with live subscriptions
  # leaves them orphaned against a _deleted-topic_ rather than removing them.
  info "Pub/Sub subscriptions, then topics"
  for sub in $(gcloud pubsub subscriptions list --project="$PROJECT" \
                 --filter="labels.deployment=$NAME" --format='value(name)' 2>/dev/null || true); do
    try gcloud pubsub subscriptions delete "$sub" --project="$PROJECT" --quiet
  done
  for topic in $(gcloud pubsub topics list --project="$PROJECT" \
                   --filter="labels.deployment=$NAME" --format='value(name)' 2>/dev/null || true); do
    try gcloud pubsub topics delete "$topic" --project="$PROJECT" --quiet
  done

  # -r -f: the dataset holds tables, and bq refuses to drop a non-empty one.
  # This is the irreversible line in the whole script.
  info "BigQuery dataset $DATASET (all tables and all data)"
  try bq --project_id="$PROJECT" rm -r -f -d "$PROJECT:$DATASET"

  info "Cloud Run runtime service account and its IAM bindings"
  sa="$NAME-run@$PROJECT.iam.gserviceaccount.com"
  for role in roles/pubsub.subscriber roles/pubsub.publisher \
              roles/bigquery.dataEditor roles/secretmanager.secretAccessor; do
    try gcloud projects remove-iam-policy-binding "$PROJECT" \
      --member="serviceAccount:$sa" --role="$role" --condition=None --quiet
  done
  try gcloud iam service-accounts delete "$sa" --project="$PROJECT" --quiet
fi

if [ "$MODE" = lift-and-shift ]; then
  info "Managed Kafka cluster (topics go with it)"
  try gcloud managed-kafka clusters delete "$NAME-kafka" --project="$PROJECT" \
    --location="$REGION" --quiet
fi

if [ "$MODE" != self-hosted ]; then
  info "Cloud SQL"
  # Deletion protection is on by default on newer instances; clear it first or
  # the delete is rejected with a message that reads like a permissions error.
  try gcloud sql instances patch "$NAME-pg" --project="$PROJECT" --no-deletion-protection --quiet
  try gcloud sql instances delete "$NAME-pg" --project="$PROJECT" --quiet

  info "Artifact Registry"
  try gcloud artifacts repositories delete "$NAME-images" --project="$PROJECT" \
    --location="$REGION" --quiet

  info "Secret Manager"
  for s in $(by_label secrets list); do
    try gcloud secrets delete "$s" --project="$PROJECT" --quiet
  done
fi

if [ "${HAS_VMS:-yes}" = yes ]; then
  info "Compute instances"
  for vm in $(by_label compute instances list --zones="$ZONE"); do
    # Boot disks are auto-delete, so this takes the disks with it.
    try gcloud compute instances delete "$vm" --project="$PROJECT" --zone="$ZONE" --quiet
  done
fi

info "GCS bucket"
try gcloud storage rm --recursive "gs://$BUCKET" --project="$PROJECT" --quiet

info "Networking (must come last — everything above holds a reference)"
if [ "${HAS_VMS:-yes}" = yes ]; then
  # Only the VM-bearing modes ever created these.
  try gcloud compute routers nats delete "$NAME-nat" --project="$PROJECT" \
    --router="$NAME-router" --region="$REGION" --quiet
  try gcloud compute routers delete "$NAME-router" --project="$PROJECT" --region="$REGION" --quiet
  for rule in allow-web allow-ssh; do
    try gcloud compute firewall-rules delete "$NAME-$rule" --project="$PROJECT" --quiet
  done
fi
try gcloud compute firewall-rules delete "$NAME-allow-internal" --project="$PROJECT" --quiet
if [ "$MODE" != self-hosted ]; then
  # The Service Networking peering pins the VPC; it must go before the subnet.
  try gcloud services vpc-peerings delete --project="$PROJECT" \
    --service=servicenetworking.googleapis.com --network="$NAME-vpc" --quiet
  try gcloud compute addresses delete "$NAME-psa" --project="$PROJECT" --global --quiet
fi
try gcloud compute networks subnets delete "$NAME-subnet" --project="$PROJECT" \
  --region="$REGION" --quiet
try gcloud compute networks delete "$NAME-vpc" --project="$PROJECT" --quiet

if [ "$DRY_RUN" = no ]; then
  rm -rf "$SCRIPT_DIR/state/$NAME"
  ok "deleted state/$NAME"
fi

banner "Teardown complete — $NAME"
cat <<EOF
Not deleted (deploy.sh never created them):
  • APIs enabled on the project — harmless and free while unused
  • ClickHouse Cloud services, if you used a ClickHouse Cloud API key
  • Cloud Build history and any logs in Cloud Logging
  • ${MODE} deployments: any Dataflow job you submitted yourself —
    check with: gcloud dataflow jobs list --region=$REGION --status=active

Verify nothing survived:
  gcloud compute instances list --project=$PROJECT --filter="labels.deployment=$NAME"
  gcloud compute networks list --project=$PROJECT --filter="name~^$NAME"
EOF
