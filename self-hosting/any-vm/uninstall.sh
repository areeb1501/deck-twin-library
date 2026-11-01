#!/usr/bin/env bash
# Remove what install.sh put on this machine.
#
#   bash self-hosting/any-vm/uninstall.sh [/opt/<name>] [--dry-run]
#
# Data is a separate question from containers: stopping the stack is asked once,
# deleting the volumes is asked again. Docker itself is never removed — this
# script did not necessarily install it, and other things may depend on it.
set -euo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=../lib/common.sh
. "$HERE/../lib/common.sh"

DRY_RUN=no
TARGET=""
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=yes ;;
    -h|--help) printf 'usage: uninstall.sh [/opt/<name>] [--dry-run]\n'; exit 0 ;;
    -*)        die "unknown flag '$arg'" ;;
    *)         TARGET=$arg ;;
  esac
done
TARGET=${TARGET:-/opt/plant-stream}

run() {
  if [ "$DRY_RUN" = yes ]; then printf '%s  $ %s%s\n' "$C_DIM" "$*" "$C_RST"; return 0; fi
  # A partial install must still be removable, so a missing resource is a
  # warning, not a stop.
  "$@" || warn "failed (continuing): $*"
}

if [ "$(id -u)" = 0 ]; then SUDO=""; else SUDO="sudo"; fi

[ -d "$TARGET" ] || die "no install found at $TARGET — pass the directory: uninstall.sh /opt/<name>"

# One install dir holds one of the two stacks; find whichever compose project
# is actually there rather than assuming.
COMPOSE_DIRS=""
[ -f "$TARGET/streaming/docker-compose.yml" ] && COMPOSE_DIRS="$TARGET/streaming"
[ -f "$TARGET/docker-compose.yaml" ] && COMPOSE_DIRS="$COMPOSE_DIRS $TARGET"
[ -n "$COMPOSE_DIRS" ] || die "no docker compose project under $TARGET — nothing this script installed"

banner "Uninstall — $TARGET"
for d in $COMPOSE_DIRS; do printf '  compose project: %s\n' "$d"; done
printf '\n'
warn "this stops and removes every container for this deployment"
info "images are left in the local cache — 'docker image prune -a' reclaims them"

read -r -p "$(printf '%sType %s"uninstall"%s%s to continue (anything else aborts):%s ' \
  "$C_BOLD" "$C_YLW" "$C_RST" "$C_BOLD" "$C_RST")" reply
[ "$reply" = "uninstall" ] || die "aborted — nothing was removed"

# Asked separately and defaulted to no: Kafka logs, the ClickHouse tables and
# the Airflow metadata DB all live in volumes, and they are not recoverable.
ask_yesno DROP_DATA "Also DELETE the data volumes (Kafka logs, ClickHouse/DuckDB data, Postgres, Grafana)" n
ask_yesno DROP_DIR  "Also delete the directory $TARGET (includes .env and ACCESS.md)" n

VOL_FLAG=""
[ "$DROP_DATA" = yes ] && VOL_FLAG="--volumes"

for d in $COMPOSE_DIRS; do
  info "stopping $d"
  # Every profile has to be named or its containers are simply not considered,
  # and `down` leaves them running with no error.
  ( cd "$d" && run $SUDO docker compose \
      --profile plantrisk --profile loadgen --profile duckdb --profile disabled \
      down --remove-orphans $VOL_FLAG )
done

if [ "$DROP_DATA" = yes ]; then
  ok "containers and data volumes removed"
else
  info "volumes kept — reinstalling into $TARGET picks the data back up"
fi

if [ "$DROP_DIR" = yes ]; then
  run $SUDO rm -rf "$TARGET"
  ok "removed $TARGET"
else
  info "kept $TARGET (secrets are still in .env and ACCESS.md, both mode 600)"
fi

# Created by install.sh only when Airflow was not also installed here; leaving a
# shared docker network behind is harmless, removing one in use is not.
$SUDO docker network rm airflow_default >/dev/null 2>&1 \
  && ok "removed the airflow_default network" \
  || info "left the airflow_default network in place (still in use, or already gone)"

if command -v ufw >/dev/null 2>&1; then
  warn "ufw rules are NOT removed automatically — review with 'ufw status numbered'"
fi
ok "done. Docker itself was left installed."
