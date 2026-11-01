#!/usr/bin/env bash
# Deletes everything deploy.sh created for a named deployment.
#
# The whole reason deploy.sh puts one deployment in one resource group: teardown
# is `az group delete`, with no chance of missing an orphan NIC, disk, public IP
# or NSG. Nothing outside rg-<name> is ever touched.
#
#   bash teardown.sh <name> [--dry-run] [--keep-state]
set -euo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
. "$HERE/../lib/common.sh"

DRY_RUN=no
KEEP_STATE=no
NAME=""
for arg in "$@"; do
  case "$arg" in
    --dry-run)    DRY_RUN=yes ;;
    --keep-state) KEEP_STATE=yes ;;
    -h|--help)    printf 'usage: %s <name> [--dry-run] [--keep-state]\n' "$0"; exit 0 ;;
    -*)           die "unknown flag '$arg'" ;;
    *)            NAME=$arg ;;
  esac
done
[ -n "$NAME" ] || die "usage: $0 <deployment-name> [--dry-run] [--keep-state]"
validate_name "$NAME"

RG="rg-$NAME"
STATE_DIR="$HERE/state/$NAME"

run() {
  if [ "$DRY_RUN" = yes ]; then
    printf '  %s$ %s%s\n' "$C_DIM" "$*" "$C_RST"
    return 0
  fi
  "$@"
}

banner "Teardown — $NAME"

if [ -f "$STATE_DIR/state.env" ]; then
  ok "found $STATE_DIR/state.env"
  sed 's/^/    /' "$STATE_DIR/state.env"
else
  warn "no local state for '$NAME' — falling back to the resource group name alone"
fi

if [ "$DRY_RUN" = no ]; then
  require_cli az "brew install azure-cli"
  az account show >/dev/null 2>&1 || die "not logged in — run 'az login'"
  az group exists -n "$RG" | grep -q true || die "resource group '$RG' does not exist in this subscription"

  printf '\n%sResources in %s:%s\n' "$C_BOLD" "$RG" "$C_RST"
  az resource list -g "$RG" --query "[].{name:name,type:type}" -o table || true
fi

printf '\n'
warn "this permanently deletes the resource group '$RG' and everything in it,"
warn "including Kafka/ClickHouse data volumes and any Key Vault secrets."
read -r -p "$(printf '%sType the deployment name %s"%s"%s%s to confirm:%s ' \
  "$C_BOLD" "$C_YLW" "$NAME" "$C_RST" "$C_BOLD" "$C_RST")" reply
[ "$reply" = "$NAME" ] || die "aborted — nothing was deleted"

# Key Vault soft-delete is on by default and survives the group deletion, so the
# name stays reserved (and re-deploying with the same name fails). Purge first.
KV_NAME="kv-$(printf '%s' "$NAME" | cut -c1-18)"
if [ "$DRY_RUN" = yes ] || az keyvault show -n "$KV_NAME" -g "$RG" >/dev/null 2>&1; then
  info "deleting + purging Key Vault $KV_NAME (soft-delete would reserve the name)"
  run az keyvault delete -n "$KV_NAME" -g "$RG"
  run az keyvault purge -n "$KV_NAME"
fi

info "deleting resource group $RG"
run az group delete -n "$RG" --yes --no-wait
ok "delete submitted (--no-wait; watch with: az group show -n $RG)"

if [ "$KEEP_STATE" = no ] && [ -d "$STATE_DIR" ]; then
  # The SSH private key and the generated .env live here; there is nothing left
  # to reach with them, and leaving them behind is just a stale secret on disk.
  run rm -rf "$STATE_DIR"
  ok "removed local state $STATE_DIR"
elif [ -d "$STATE_DIR" ]; then
  warn "kept local state (still holds the SSH key and .env): $STATE_DIR"
fi

printf '\n'
