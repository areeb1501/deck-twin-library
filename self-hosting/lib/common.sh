# Shared wizard helpers for the self-hosting deploy scripts.
# Sourced by aws/deploy.sh, azure/deploy.sh, gcp/deploy.sh — bash 3.2+ (macOS).
#
# Everything here is cloud-agnostic: prompting, sizing, secrets, the plan/
# confirm gate. Cloud-specific resource creation lives in each cloud's script.

set -euo pipefail

# ---- output ----------------------------------------------------------------
if [ -t 1 ]; then
  C_BOLD=$'\033[1m'; C_DIM=$'\033[2m'; C_RED=$'\033[31m'
  C_GRN=$'\033[32m'; C_YLW=$'\033[33m'; C_CYN=$'\033[36m'; C_RST=$'\033[0m'
else
  C_BOLD=""; C_DIM=""; C_RED=""; C_GRN=""; C_YLW=""; C_CYN=""; C_RST=""
fi

info()  { printf '%s==>%s %s\n' "$C_CYN" "$C_RST" "$*"; }
ok()    { printf '%s ✓ %s %s\n' "$C_GRN" "$C_RST" "$*"; }
warn()  { printf '%s ⚠ %s %s\n' "$C_YLW" "$C_RST" "$*" >&2; }
die()   { printf '%s ✗ %s %s\n' "$C_RED" "$C_RST" "$*" >&2; exit 1; }

banner() {
  printf '\n%s%s%s\n' "$C_BOLD" "────────────────────────────────────────────────" "$C_RST"
  printf '%s  %s%s\n' "$C_BOLD" "$*" "$C_RST"
  printf '%s%s%s\n\n' "$C_BOLD" "────────────────────────────────────────────────" "$C_RST"
}

# ---- prompting -------------------------------------------------------------
# ask VAR "Prompt" "default"   — free text with a default
ask() {
  local _var=$1 _prompt=$2 _default=${3:-} _reply
  if [ -n "$_default" ]; then
    read -r -p "$(printf '%s?%s %s %s[%s]%s ' "$C_GRN" "$C_RST" "$_prompt" "$C_DIM" "$_default" "$C_RST")" _reply
    _reply=${_reply:-$_default}
  else
    while true; do
      read -r -p "$(printf '%s?%s %s ' "$C_GRN" "$C_RST" "$_prompt")" _reply
      [ -n "$_reply" ] && break
      warn "a value is required"
    done
  fi
  eval "$_var=\$_reply"
}

# ask_secret VAR "Prompt"   — hidden input, blank allowed (feature stays off)
ask_secret() {
  local _var=$1 _prompt=$2 _reply
  read -r -s -p "$(printf '%s?%s %s %s(hidden, enter to skip)%s ' "$C_GRN" "$C_RST" "$_prompt" "$C_DIM" "$C_RST")" _reply
  printf '\n'
  eval "$_var=\$_reply"
}

# ask_choice VAR "Prompt" "opt one" "opt two" ...   — numbered menu, sets VAR
# to the chosen option's TEXT and VAR_IDX to its 1-based index.
ask_choice() {
  local _var=$1 _prompt=$2; shift 2
  local _opts=("$@") _i _reply
  printf '%s?%s %s\n' "$C_GRN" "$C_RST" "$_prompt"
  for _i in "${!_opts[@]}"; do
    printf '    %s%d)%s %s\n' "$C_BOLD" "$((_i + 1))" "$C_RST" "${_opts[$_i]}"
  done
  while true; do
    read -r -p "$(printf '    select %s[1-%d]%s ' "$C_DIM" "${#_opts[@]}" "$C_RST")" _reply
    case "$_reply" in
      ''|*[!0-9]*) ;;
      *) if [ "$_reply" -ge 1 ] && [ "$_reply" -le "${#_opts[@]}" ]; then
           eval "$_var=\${_opts[\$((_reply - 1))]}"
           eval "${_var}_IDX=\$_reply"
           return
         fi ;;
    esac
    warn "enter a number between 1 and ${#_opts[@]}"
  done
}

# ask_yesno VAR "Prompt" "y|n"   — sets VAR to "yes" or "no"
ask_yesno() {
  local _var=$1 _prompt=$2 _default=${3:-n} _reply
  while true; do
    read -r -p "$(printf '%s?%s %s %s[y/n, default %s]%s ' "$C_GRN" "$C_RST" "$_prompt" "$C_DIM" "$_default" "$C_RST")" _reply
    _reply=${_reply:-$_default}
    case "$_reply" in
      y|Y|yes) eval "$_var=yes"; return ;;
      n|N|no)  eval "$_var=no";  return ;;
    esac
  done
}

# ---- validation ------------------------------------------------------------
require_cli() {  # require_cli aws "brew install awscli"
  command -v "$1" >/dev/null 2>&1 || die "'$1' CLI not found. Install it: $2"
}

validate_name() {  # lowercase alphanum + hyphen, for resource-name prefixes
  case "$1" in
    *[!a-z0-9-]*|-*|*-) die "'$1' must be lowercase letters, digits, inner hyphens" ;;
  esac
}

# ---- sizing ----------------------------------------------------------------
# Map estimated events/second to a T-shirt tier. Each cloud script maps the
# tier to instance types. The single-VM reference (2 vCPU) runs the
# full stack at 80 ev/s with headroom and has been load-tested to 5000 ev/s,
# so tiers are deliberately conservative rather than generous.
size_for_eps() {  # size_for_eps 5000 -> small|medium|large
  local eps=$1
  case "$eps" in *[!0-9]*|'') die "events/second must be a whole number" ;; esac
  if   [ "$eps" -le 5000 ];  then echo small     # 2 vCPU / 4 GB, single VM
  elif [ "$eps" -le 20000 ]; then echo medium    # 4 vCPU / 16 GB
  else                            echo large     # 8 vCPU / 32 GB, split roles
  fi
}

# ---- secrets ---------------------------------------------------------------
gen_password() {  # 24 chars, alphanum only so it never needs shell quoting
  # head exits before tr, so tr dies SIGPIPE and pipefail turns the whole
  # substitution into a fatal 141 under set -e. Swallow the pipe status and
  # verify the output length instead — that's the check that actually matters.
  local _p
  _p=$(LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 24) || true
  [ "${#_p}" -eq 24 ] || die "password generation failed (/dev/urandom unreadable?)"
  printf '%s' "$_p"
}

# Detect the caller's public IP so firewalls can default to "just me".
my_ip() {
  curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null \
    || curl -fsS --max-time 5 https://ifconfig.me 2>/dev/null \
    || echo ""
}

# ---- the stack -------------------------------------------------------------
# Kafka topics the pipeline needs. Partition counts follow the tier: the
# risk engine keys state per equipment unit, so partitions bound consumer
# parallelism, not throughput per se.
TOPICS="events plant.sensor.readings plant.sensor.dlq plant.sensor.dlq.outcomes plant.risk.scores plant.risk.alerts plant.notifier.control plant.notifier.emails plant.rca.audit plant.sim.control"

partitions_for_tier() {
  case "$1" in
    small)  echo 3 ;;
    medium) echo 6 ;;
    large)  echo 12 ;;
  esac
}

# ---- plan / confirm gate ---------------------------------------------------
# Every script accumulates human-readable lines with plan_add, shows them
# with plan_show, and only then asks for the explicit "deploy" confirmation.
# Nothing may be created before plan_confirm returns.
PLAN_FILE=$(mktemp)
trap 'rm -f "$PLAN_FILE"' EXIT

plan_add() { printf '  • %s\n' "$*" >>"$PLAN_FILE"; }

plan_show() {
  banner "Deployment plan — nothing has been created yet"
  cat "$PLAN_FILE"
  printf '\n'
}

plan_confirm() {
  local _reply
  read -r -p "$(printf '%sType %s"deploy"%s%s to create these resources (anything else aborts):%s ' "$C_BOLD" "$C_YLW" "$C_RST" "$C_BOLD" "$C_RST")" _reply
  [ "$_reply" = "deploy" ] || die "aborted — no resources were created"
}

# ---- env file --------------------------------------------------------------
# Writes the streaming stack's .env with generated secrets, chmod 600.
write_stack_env() {  # write_stack_env /path/.env EPS
  local f=$1 eps=$2
  umask 077
  cat >"$f" <<EOF
# Generated by self-hosting deploy wizard — do not commit.
PLANT_PG_PASSWORD=$(gen_password)
CLICKHOUSE_VIEWER_PASSWORD=$(gen_password)
GRAFANA_ADMIN_PASSWORD=$(gen_password)
INGEST_API_KEY=$(gen_password)
PLANT_EVENTS_PER_SECOND=${eps}
EMAIL_ENABLED=false
RCA_ENABLED=false
EOF
  ok "wrote $f (mode 600 — secrets are generated, not prompted)"
}
