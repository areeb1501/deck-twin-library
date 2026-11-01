#!/usr/bin/env bash
# Deletes everything deploy.sh created for a named deployment, in reverse
# dependency order. Reads state/<name>/state.env — nothing is discovered by
# tag scanning, so a resource this script does not know about is never touched.
#
#   bash self-hosting/aws/teardown.sh <name> [--dry-run] [--keep-bucket]
set -euo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=../lib/common.sh
. "$HERE/../lib/common.sh"

DRY_RUN=no
KEEP_BUCKET=no
EMULATE=no
NAME=""
for arg in "$@"; do
  case "$arg" in
    --dry-run)     DRY_RUN=yes ;;
    --keep-bucket) KEEP_BUCKET=yes ;;
    --emulate)     EMULATE=yes ;;
    -*)            die "unknown flag '$arg'" ;;
    *)             NAME=$arg ;;
  esac
done

if [ "$EMULATE" = yes ]; then
  export AWS_ENDPOINT_URL=http://localhost:4566
  export AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test
  # Same belt-and-braces as deploy.sh: CLI v1 honors AWS_ENDPOINT_URL only for
  # some services, so force it per-call — nothing may leave localhost.
  aws() { command aws --endpoint-url "$AWS_ENDPOINT_URL" "$@"; }
  warn "--emulate: tearing down against LocalStack, not AWS"
fi
[ -n "$NAME" ] || die "usage: teardown.sh <deployment-name> [--dry-run] [--keep-bucket]"

STATE_DIR="$HERE/state/$NAME"
STATE_FILE="$STATE_DIR/state.env"
[ -f "$STATE_FILE" ] || die "no state file at $STATE_FILE — nothing to tear down"

# shellcheck disable=SC1090
. "$STATE_FILE"
export AWS_DEFAULT_REGION="$REGION"

run() {
  if [ "$DRY_RUN" = yes ]; then printf '%s  $ %s%s\n' "$C_DIM" "$*" "$C_RST"; return 0; fi
  # Teardown must not stop at the first already-gone resource, or a partial
  # deployment can never be cleaned up.
  "$@" || warn "failed (continuing): $*"
}

have() { [ -n "${1:-}" ] && [ "${1:-}" != None ]; }

banner "Teardown — $NAME ($REGION)"
grep -v '^SECRET_' "$STATE_FILE" | sed 's/^/  /'
printf '\n'
warn "this deletes the EBS/EFS data, ClickHouse tables and Kafka topics with it"

read -r -p "$(printf '%sType the deployment name %s%s%s to confirm:%s ' "$C_BOLD" "$C_YLW" "$NAME" "$C_RST$C_BOLD" "$C_RST")" reply
[ "$reply" = "$NAME" ] || die "aborted — nothing was deleted"

# ---- compute ---------------------------------------------------------------
INSTANCES=""
for v in "${VM1_ID:-}" "${VM2_ID:-}" "${VM3_ID:-}" "${CH_INSTANCE:-}"; do
  if have "$v"; then INSTANCES="$INSTANCES $v"; fi
done
if [ -n "$INSTANCES" ]; then
  info "terminating instances:$INSTANCES"
  run aws ec2 terminate-instances --instance-ids $INSTANCES
  run aws ec2 wait instance-terminated --instance-ids $INSTANCES
fi

if have "${EIP_ALLOC:-}"; then
  run aws ec2 release-address --allocation-id "$EIP_ALLOC"
fi

if have "${KEY_NAME:-}"; then
  run aws ec2 delete-key-pair --key-name "$KEY_NAME"
fi

if have "${ECS_CLUSTER:-}"; then
  # Services hold ENIs in the subnets; the VPC delete fails until they drain.
  for svc in $(aws ecs list-services --cluster "$ECS_CLUSTER" --query 'serviceArns[]' --output text 2>/dev/null || true); do
    run aws ecs update-service --cluster "$ECS_CLUSTER" --service "$svc" --desired-count 0
    run aws ecs delete-service --cluster "$ECS_CLUSTER" --service "$svc" --force
  done
  run aws ecs delete-cluster --cluster "$ECS_CLUSTER"
fi

if have "${ECR_BASE:-}"; then
  for img in plant-simulator plant-risk-engine plant-dlq-redrive plant-alert-notifier plant-ingest plant-dashboard; do
    run aws ecr delete-repository --repository-name "$NAME/$img" --force
  done
fi

# ---- managed data services -------------------------------------------------
if have "${FLINK_APP:-}"; then
  run aws kinesisanalyticsv2 delete-application --application-name "$FLINK_APP" \
    --create-timestamp "$(aws kinesisanalyticsv2 describe-application --application-name "$FLINK_APP" \
      --query 'ApplicationDetail.CreateTimestamp' --output text 2>/dev/null || echo 0)"
fi

if have "${GRAFANA_WS:-}"; then
  run aws grafana delete-workspace --workspace-id "$GRAFANA_WS"
fi

if have "${MSK_ARN:-}"; then
  info "deleting MSK cluster (this takes several minutes)"
  run aws kafka delete-cluster --cluster-arn "$MSK_ARN"
fi

if have "${RDS_ID:-}"; then
  run aws rds delete-db-instance --db-instance-identifier "$RDS_ID" \
    --skip-final-snapshot --delete-automated-backups
  run aws rds wait db-instance-deleted --db-instance-identifier "$RDS_ID"
  run aws rds delete-db-subnet-group --db-subnet-group-name "$NAME-pg"
fi

# ---- secrets ---------------------------------------------------------------
# Force-delete: the 7-day recovery window blocks recreating the same name,
# which makes re-running deploy.sh with the same deployment name fail.
for s in $(grep '^SECRET_' "$STATE_FILE" | cut -d= -f2- || true); do
  run aws secretsmanager delete-secret --secret-id "$s" --force-delete-without-recovery
done

# ---- storage ---------------------------------------------------------------
if have "${BUCKET:-}" && [ "$KEEP_BUCKET" = no ]; then
  run aws s3 rm "s3://$BUCKET" --recursive
  run aws s3api delete-bucket --bucket "$BUCKET"
elif have "${BUCKET:-}"; then
  info "kept bucket s3://$BUCKET"
fi

# ---- network (last: everything above holds ENIs in it) ---------------------
# MSK and RDS deletions are asynchronous and keep ENIs attached for minutes,
# so a single delete attempt leaves the VPC behind. Retry with a pause.
retry() {  # retry <attempts> <sleep_s> cmd...
  local n=$1 s=$2 i; shift 2
  [ "$DRY_RUN" = yes ] && { run "$@"; return 0; }
  for i in $(seq 1 "$n"); do
    "$@" >/dev/null 2>&1 && return 0
    [ "$i" -lt "$n" ] && { info "waiting ${s}s for dependencies to release ($i/$n): $*"; sleep "$s"; }
  done
  warn "failed (continuing): $*"
}

for sg in "${SG_FRONT:-}" "${SG_DATA:-}"; do
  if have "$sg"; then retry 6 20 aws ec2 delete-security-group --group-id "$sg"; fi
done

if have "${IGW_ID:-}" && have "${VPC_ID:-}"; then
  run aws ec2 detach-internet-gateway --internet-gateway-id "$IGW_ID" --vpc-id "$VPC_ID"
  run aws ec2 delete-internet-gateway --internet-gateway-id "$IGW_ID"
fi

for sn in "${SUBNET_PUB:-}" "${SUBNET_A:-}" "${SUBNET_B:-}"; do
  if have "$sn"; then retry 6 20 aws ec2 delete-subnet --subnet-id "$sn"; fi
done

if have "${RT_PUB:-}"; then
  # A route table with live subnet associations refuses to delete.
  for assoc in $(aws ec2 describe-route-tables --route-table-ids "$RT_PUB" \
      --query 'RouteTables[0].Associations[?!Main].RouteTableAssociationId' --output text 2>/dev/null || true); do
    run aws ec2 disassociate-route-table --association-id "$assoc"
  done
  retry 6 20 aws ec2 delete-route-table --route-table-id "$RT_PUB"
fi
if have "${VPC_ID:-}"; then retry 9 20 aws ec2 delete-vpc --vpc-id "$VPC_ID"; fi

if [ "$DRY_RUN" = no ]; then
  rm -rf "$STATE_DIR"
  ok "deleted $NAME and removed $STATE_DIR (including the .pem)"
else
  ok "dry run complete — $STATE_DIR left in place"
fi
