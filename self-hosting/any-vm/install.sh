#!/usr/bin/env bash
# Install the stack on a Linux VM you already own — bare metal, Proxmox, VPS.
#
# Unlike the cloud wizards (aws/azure/gcp deploy.sh), this runs ON the target
# machine. There is no managed option and nothing is provisioned: it inspects
# the hardware, asks what you want, prints a plan, and only then builds.
#
#   git clone <repo> ~/stack && cd ~/stack
#   bash self-hosting/any-vm/install.sh [--dry-run]
set -euo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=../lib/common.sh
. "$HERE/../lib/common.sh"
REPO_ROOT=$(cd "$HERE/../.." && pwd)

DRY_RUN=no
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=yes ;;
    -h|--help) printf 'usage: install.sh [--dry-run]\n'; exit 0 ;;
    *) die "unknown flag '$arg'" ;;
  esac
done

run() {
  if [ "$DRY_RUN" = yes ]; then printf '%s  $ %s%s\n' "$C_DIM" "$*" "$C_RST"; return 0; fi
  "$@"
}

# Compose has to run with its project directory as cwd. A bare subshell `cd`
# would fail under --dry-run, where none of those directories exist, so the cd
# goes inside run().
in_dir() {  # in_dir <dir> <command string>
  local d=$1; shift
  run bash -c "cd '$d' && $*"
}

# Everything that touches /opt or docker goes through $SUDO so the script works
# unchanged as root or as a sudo-capable user.
if [ "$(id -u)" = 0 ]; then SUDO=""; else SUDO="sudo"; fi

# --dry-run creates no directories, so every step that writes a file has to be
# announced rather than attempted.
dry() { [ "$DRY_RUN" = yes ]; }

# ============================================================================
# 1. preflight
# ============================================================================
CORES=0 RAM_GB=0 DISK_GB=0
ACTIVE_PROFILES=""

free_gb() {  # free_gb <path> — walks up to the nearest existing ancestor
  local p=$1
  while [ ! -d "$p" ] && [ "$p" != / ]; do p=$(dirname "$p"); done
  df -Pk "$p" | awk 'NR==2 {printf "%d", $4/1024/1024}'
}

hardware_facts() {
  CORES=$(nproc 2>/dev/null || echo 1)
  RAM_GB=$(awk '/MemTotal/ {printf "%d", $2/1024/1024}' /proc/meminfo)
  DISK_GB=$(free_gb /opt)   # the default install root; re-checked against $TARGET later
}

preflight() {
  banner "Preflight"

  [ "$(uname -s)" = Linux ] || die "this installer is Linux-only (found $(uname -s)) — use the aws/azure/gcp wizards from a laptop"
  case "$(uname -m)" in
    x86_64|aarch64|arm64) ;;
    *) die "unsupported CPU architecture $(uname -m) — the stack images ship amd64 and arm64 only" ;;
  esac

  hardware_facts
  ok "$CORES cores · ${RAM_GB} GB RAM · ${DISK_GB} GB free on /opt · $(uname -m)"

  # Absolute floor. Mode-specific minimums are re-checked after the wizard,
  # because "enough" depends entirely on what they pick.
  [ "$CORES"   -ge 2  ] || die "This system requires at least 2 CPU cores (found $CORES)"
  [ "$RAM_GB"  -ge 4  ] || die "This system requires at least 4 GB RAM (found ${RAM_GB} GB)"
  [ "$DISK_GB" -ge 20 ] || die "This system requires at least 20 GB free disk on /opt (found ${DISK_GB} GB)"

  require_cli curl    "apt-get install -y curl"
  require_cli rsync   "apt-get install -y rsync"
  require_cli openssl "apt-get install -y openssl"
  command -v ss >/dev/null 2>&1 || warn "'ss' not found — port conflict checks will be skipped (apt-get install iproute2)"

  if ! command -v docker >/dev/null 2>&1; then
    if command -v apt-get >/dev/null 2>&1; then
      ask_yesno INSTALL_DOCKER "Docker is not installed. Install it now via get.docker.com" y
      [ "$INSTALL_DOCKER" = yes ] || die "Docker is required. Install it, then re-run this script"
      info "installing Docker — this pulls and runs the official convenience script"
      run bash -c "curl -fsSL https://get.docker.com | $SUDO sh"
    else
      die "Docker is not installed and this is not a Debian/Ubuntu system (no apt-get).
    Install Docker Engine + the compose plugin for your distro, then re-run:
    https://docs.docker.com/engine/install/"
    fi
  fi

  $SUDO docker compose version >/dev/null 2>&1 \
    || die "the 'docker compose' plugin is missing — install docker-compose-plugin (apt-get install docker-compose-plugin)"

  # The access-mode overrides use the '!override' YAML tag to replace a
  # service's published ports; it landed in Compose v2.24. Before that the two
  # port lists merge instead, and the host tries to bind :P and 127.0.0.1:P.
  local cv cmaj cmin
  cv=$($SUDO docker compose version --short 2>/dev/null | tr -d 'v')
  cmaj=${cv%%.*}; cmin=${cv#*.}; cmin=${cmin%%.*}
  if [ "${cmaj:-0}" -lt 2 ] || { [ "$cmaj" = 2 ] && [ "${cmin:-0}" -lt 24 ]; }; then
    die "docker compose $cv is too old — v2.24+ is required for the '!override' port syntax this script writes"
  fi
  ok "docker $($SUDO docker --version 2>/dev/null | awk '{print $3}' | tr -d ,) · compose $cv"
}

port_busy() {  # port_busy 8080
  command -v ss >/dev/null 2>&1 || return 1
  ss -ltn 2>/dev/null | awk '{print $4}' | grep -qE "[:.]$1\$"
}

check_ports() {  # check_ports 80 443 ...
  local p busy=""
  for p in "$@"; do port_busy "$p" && busy="$busy $p"; done
  [ -z "$busy" ] || die "port(s)$busy are already in use — stop whatever is listening (ss -ltnp) or free them, then re-run"
  ok "ports $* are free"
}

# ============================================================================
# 2. wizard
# ============================================================================
collect_prefs() {
  banner "What are we installing?"

  ask NAME "Deployment name" "plant-stream"
  validate_name "$NAME"
  ask TARGET "Install directory" "/opt/$NAME"

  ask_choice PIPELINE "Pipeline type" \
    "Real-time streaming (Kafka → Flink → analytics + dashboards)" \
    "Batch (Airflow 3.3 + storage)"

  if [ "$PIPELINE_IDX" = 1 ]; then prefs_realtime; else prefs_batch; fi
}

prefs_realtime() {
  [ -d "$REPO_ROOT/streaming" ] \
    || die "streaming/ not found next to this script (looked in $REPO_ROOT).
    Copy the whole repo checkout onto this VM — install.sh needs streaming/ to install."

  ask EPS "Estimated events/second at peak" "80"
  TIER=$(size_for_eps "$EPS")
  PARTS=$(partitions_for_tier "$TIER")
  ok "$EPS ev/s → tier $TIER → $PARTS partitions/topic"
  # The tiers were sized on a 2-vCPU reference box; anything above 'small'
  # wants real cores, and Flink is the first thing to fall behind without them.
  case "$TIER" in
    medium) [ "$CORES" -ge 4 ] || warn "$EPS ev/s is a 'medium' workload (4+ cores recommended) on a ${CORES}-core box — expect consumer lag" ;;
    large)  [ "$CORES" -ge 8 ] || warn "$EPS ev/s is a 'large' workload (8+ cores recommended) on a ${CORES}-core box — this will not keep up" ;;
  esac

  ask_choice ANALYTICS "Analytics engine" \
    "ClickHouse (full dashboards: Grafana + Streamlit, heavier — ~8 GB RAM)" \
    "DuckDB (lightweight single file — NO Grafana/Streamlit, query with the duckdb CLI)"

  if [ "$ANALYTICS_IDX" = 1 ]; then
    MIN_RAM=8; HARD_RAM=6; MIN_DISK=40
  else
    MIN_RAM=6; HARD_RAM=4; MIN_DISK=30
  fi
  check_mode_specs "real-time"

  ask_yesno PLANTRISK "Enable the plant-risk pipeline (simulator → risk engine → alerts)" y
  ask_yesno LOADGEN "Enable the synthetic load generator (extra demo traffic)" n

  prefs_access_realtime
}

check_mode_specs() {  # check_mode_specs <label>
  DISK_GB=$(free_gb "$TARGET")   # they may have pointed $TARGET at another mount
  [ "$RAM_GB"  -ge "$HARD_RAM" ] || die "the $1 stack needs at least ${HARD_RAM} GB RAM (found ${RAM_GB} GB) — containers will be OOM-killed below this"
  [ "$DISK_GB" -ge "$MIN_DISK" ] || die "the $1 stack needs at least ${MIN_DISK} GB free at $TARGET (found ${DISK_GB} GB)"
  if [ "$RAM_GB" -lt "$MIN_RAM" ]; then
    warn "${RAM_GB} GB RAM is below the recommended ${MIN_RAM} GB — the compose mem_limits sum to more than this."
    warn "It works with swap, slowly. Add swap, or pick a lighter option."
    ask_yesno TIGHT_OK "Continue anyway" n
    [ "$TIGHT_OK" = yes ] || die "aborted — nothing was installed"
  fi
}

prefs_access_realtime() {
  PUBLIC_IP=$(my_ip)
  [ -n "$PUBLIC_IP" ] || PUBLIC_IP=$(hostname -I 2>/dev/null | awk '{print $1}')

  # DuckDB mode has no dashboards for Caddy to front, and Caddy's depends_on
  # would drag ClickHouse/Grafana back up. So it is not offered there.
  if [ "$ANALYTICS_IDX" = 1 ] && [ -n "$PUBLIC_IP" ]; then
    ask_choice ACCESS "How do you want to reach the UIs?" \
      "localhost only — SSH tunnels, most secure (recommended)" \
      "Plain IP + ports — no domain, no TLS, http://$PUBLIC_IP:<port>" \
      "Domain/TLS via Caddy — https://dash.${PUBLIC_IP//./-}.sslip.io, auto Let's Encrypt"
  else
    ask_choice ACCESS "How do you want to reach the UIs?" \
      "localhost only — SSH tunnels, most secure (recommended)" \
      "Plain IP + ports — no domain, no TLS, http://${PUBLIC_IP:-<this-ip>}:<port>"
  fi

  EXPOSE_PORTS=""
  case "$ACCESS_IDX" in
    2)
      [ -n "$PUBLIC_IP" ] || die "could not detect this VM's IP address — use localhost-only mode and tunnel"
      if [ "$ANALYTICS_IDX" = 1 ]; then
        ask_yesno EXPOSE_ALL "Expose ALL UIs (adds Kafka UI + Flink) instead of just the dashboards" n
        if [ "$EXPOSE_ALL" = yes ]; then
          EXPOSE_PORTS="plant-dashboard:8501:8501 grafana:3000:3000 plant-ingest:8088:8080 kafka-ui:8081:8080 flink-jobmanager:8082:8081"
        else
          EXPOSE_PORTS="plant-dashboard:8501:8501 grafana:3000:3000 plant-ingest:8088:8080"
        fi
      else
        ask_yesno EXPOSE_ALL "Expose the Kafka UI and Flink dashboard too" n
        EXPOSE_PORTS="plant-ingest:8088:8080"
        [ "$EXPOSE_ALL" = yes ] && EXPOSE_PORTS="$EXPOSE_PORTS kafka-ui:8081:8080 flink-jobmanager:8082:8081"
      fi
      warn "Plain-IP mode has NO TLS: passwords and API keys cross the network in clear text."
      [ "${EXPOSE_ALL:-no}" = yes ] && warn "Flink and the Kafka UI have NO authentication at all — the Flink REST API accepts job uploads, which is remote code execution on this host."
      if command -v ufw >/dev/null 2>&1; then
        ADMIN_IP=$(my_ip)
        if [ -n "$ADMIN_IP" ]; then
          ask_yesno UFW "Add ufw rules restricting these ports to $ADMIN_IP only" y
        fi
      else
        warn "ufw is not installed — nothing will restrict who can reach these ports"
      fi
      ;;
    3)
      IP_DASHED=${PUBLIC_IP//./-}
      # Let's Encrypt will not issue for a bare IP, but it will for an sslip.io
      # name that resolves to one — which is why the hostnames look like this.
      info "hostnames will be *.$IP_DASHED.sslip.io → $PUBLIC_IP"
      warn "ports 80 and 443 must be reachable from the internet or the certificate order fails"
      ;;
  esac
}

prefs_batch() {
  [ -f "$REPO_ROOT/deploy/airflow-docker-compose.yaml" ] \
    || die "deploy/ not found next to this script (looked in $REPO_ROOT) — copy the repo checkout onto this VM"

  MIN_RAM=4; HARD_RAM=4; MIN_DISK=20
  check_mode_specs "batch Airflow"

  ask_choice STORAGE "Where do pipeline outputs go?" \
    "Local disk — bind mount $TARGET/data" \
    "S3-compatible object storage (MinIO, Cloudflare R2, Backblaze B2, AWS S3)"
  if [ "$STORAGE_IDX" = 2 ]; then
    ask S3_ENDPOINT "S3 endpoint URL (blank for AWS S3)" "https://s3.amazonaws.com"
    ask S3_BUCKET "Bucket name" "$NAME-data"
    ask S3_KEY "Access key ID" ""
    ask_secret S3_SECRET "Secret access key"
    [ -n "$S3_SECRET" ] || die "an S3 secret key is required for object-storage mode"
  fi

  PUBLIC_IP=$(my_ip)
  [ -n "$PUBLIC_IP" ] || PUBLIC_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
  # No Caddy option here: the Airflow compose has no TLS proxy, and bolting one
  # on is a bigger change than this beginner path should make.
  ask_choice ACCESS "How do you want to reach the Airflow UI (port 8080)?" \
    "localhost only — SSH tunnel, most secure (recommended)" \
    "Plain IP + port — http://${PUBLIC_IP:-<this-ip>}:8080, no TLS"
  if [ "$ACCESS_IDX" = 2 ]; then
    warn "the Airflow UI will be on the open internet over plain HTTP — its login is the only protection"
  fi
}

# ============================================================================
# 3. plan
# ============================================================================
build_plan() {
  plan_add "Install directory $TARGET (owned by $(id -un))"
  if [ "$PIPELINE_IDX" = 1 ]; then
    plan_add "Copy streaming/ → $TARGET/streaming, write .env (mode 600, generated secrets)"
    plan_add "Kafka (KRaft, RF 1) + Flink 1.20 jobmanager/taskmanager + Kafka UI"
    if [ "$ANALYTICS_IDX" = 1 ]; then
      plan_add "ClickHouse 26.7 + Grafana + Streamlit dashboard  — RAM budget ~8.5 GB"
      plan_add "ClickHouse schemas applied: plant_risk, notifier tables, dlq_redrive"
    else
      plan_add "DuckDB sink container → $TARGET/streaming/data/plant.duckdb  — RAM budget ~5 GB"
      plan_add "DISABLED in DuckDB mode: clickhouse, grafana, plant-dashboard, notifier, caddy"
    fi
    [ "$PLANTRISK" = yes ] && plan_add "plant-risk profile: postgres, simulator, risk-engine, dlq-redrive, ingest"
    [ "$LOADGEN" = yes ] && plan_add "loadgen profile: synthetic demo traffic on topic 'events'"
    plan_add "$(echo "$TOPICS" | wc -w | tr -d ' ') Kafka topics, $PARTS partitions each, RF 1"
    plan_add "Docker volumes: kafka-data, flink-checkpoints/savepoints$([ "$ANALYTICS_IDX" = 1 ] && echo ', clickhouse-data, grafana-data')$([ "$PLANTRISK" = yes ] && echo ', plant-pg-data')"
    case "$ACCESS_IDX" in
      1) plan_add "Access: loopback only — nothing bound to 0.0.0.0, Caddy disabled" ;;
      2) plan_add "Access: 0.0.0.0 on $(echo "$EXPOSE_PORTS" | tr ' ' '\n' | cut -d: -f2 | tr '\n' ' ')— NO TLS, Caddy disabled" ;;
      3) plan_add "Access: Caddy on 80/443, Let's Encrypt certs for *.$IP_DASHED.sslip.io" ;;
    esac
  else
    plan_add "Copy dags/, Dockerfile, deploy/airflow-docker-compose.yaml → $TARGET"
    plan_add "Airflow 3.3 CeleryExecutor: apiserver, scheduler, dag-processor, worker, triggerer, postgres, redis"
    plan_add "Build the custom Airflow image (databricks, papermill, ipykernel)"
    plan_add "Generate .env: admin password, Fernet key (mode 600)  — RAM budget ~4 GB"
    if [ "$STORAGE_IDX" = 1 ]; then
      plan_add "Outputs → local disk at $TARGET/data"
    else
      plan_add "Outputs → s3://$S3_BUCKET at $S3_ENDPOINT (AWS_* vars in .env)"
    fi
    if [ "$ACCESS_IDX" = 1 ]; then plan_add "Access: 127.0.0.1:8080 only"; else plan_add "Access: 0.0.0.0:8080 — NO TLS"; fi
  fi
  if [ "${UFW:-no}" = yes ]; then plan_add "ufw rules allowing the exposed ports from $ADMIN_IP only"; fi
}

# ============================================================================
# 4. execute — real-time
# ============================================================================
install_realtime() {
  banner "Installing the streaming stack"
  STREAM_DIR="$TARGET/streaming"
  run $SUDO mkdir -p "$STREAM_DIR"
  run $SUDO chown -R "$(id -u):$(id -g)" "$TARGET"
  # --delete keeps re-runs honest, so everything this script generates on the
  # far side (.env, the override, the DuckDB file) has to be excluded or a
  # second run would wipe the data it just installed.
  run rsync -a --delete --exclude='.env' --exclude='__pycache__' --exclude='.pytest_cache' \
    --exclude='data' --exclude='duckdb-sink' --exclude='docker-compose.override.yml' \
    "$REPO_ROOT/streaming/" "$STREAM_DIR/"

  if ! dry; then
    write_stack_env "$STREAM_DIR/.env" "$EPS"
    # write_stack_env does not set the ClickHouse ADMIN password (the cloud
    # wizards append it on the instance) — gen-clickhouse-user.sh needs it.
    printf 'CLICKHOUSE_PASSWORD=%s\n' "$(gen_password)" >>"$STREAM_DIR/.env"
  fi

  if [ "$ANALYTICS_IDX" = 1 ]; then
    run bash "$STREAM_DIR/bin/gen-clickhouse-user.sh"   # it cd's to its own repo root
  else
    run cp -r "$HERE/duckdb-sink" "$STREAM_DIR/duckdb-sink"
    run mkdir -p "$STREAM_DIR/data"
  fi

  write_override
  configure_caddy

  # The streaming compose joins airflow_default as an external network; when
  # Airflow is not installed here that network still has to exist.
  $SUDO docker network inspect airflow_default >/dev/null 2>&1 \
    || run $SUDO docker network create airflow_default

  local profiles=""
  [ "$PLANTRISK" = yes ] && { profiles="--profile plantrisk"; ACTIVE_PROFILES="plantrisk"; }
  [ "$ANALYTICS_IDX" = 2 ] && { profiles="$profiles --profile duckdb"; ACTIVE_PROFILES="${ACTIVE_PROFILES:+$ACTIVE_PROFILES,}duckdb"; }
  [ "$LOADGEN" = yes ] && ACTIVE_PROFILES="${ACTIVE_PROFILES:+$ACTIVE_PROFILES,}loadgen"

  info "building images — the first run pulls Kafka, Flink and ClickHouse (several GB)"
  in_dir "$STREAM_DIR" "$SUDO docker compose $profiles up -d --build"
  if [ "$LOADGEN" = yes ]; then
    in_dir "$STREAM_DIR" "$SUDO docker compose --profile loadgen up -d loadgen"
  fi

  wait_for_kafka
  create_topics
  if [ "$ANALYTICS_IDX" = 1 ]; then apply_clickhouse_schemas; fi
  apply_ufw
}

write_override() {
  # docker-compose.override.yml is picked up automatically. Disabling a service
  # is done by assigning it a profile nobody enables — compose has no "remove".
  local f="$STREAM_DIR/docker-compose.override.yml" svc name host cport body
  if dry; then info "would write $f"; return 0; fi
  # Built into a variable first: ClickHouse + Caddy needs no override at all,
  # and a file containing a bare `services:` is a compose parse error.
  body=$(
    if [ "$ANALYTICS_IDX" = 2 ]; then
      for svc in clickhouse grafana plant-dashboard plant-alert-notifier; do
        printf '  %s:\n    profiles: ["disabled"]\n' "$svc"
      done
      cat <<'YAML'
  duckdb-sink:
    build: ./duckdb-sink
    image: duckdb-sink:1
    container_name: duckdb-sink
    profiles: [duckdb]
    restart: unless-stopped
    networks: [streaming]
    depends_on:
      kafka:
        condition: service_healthy
    environment:
      KAFKA_BOOTSTRAP: kafka:9092
      TOPICS: plant.risk.scores,plant.sensor.readings
      DUCKDB_PATH: /data/plant.duckdb
    volumes:
      - ./data:/data
    mem_limit: 384m
YAML
    fi
    # Caddy is the only service bound to 0.0.0.0; it only runs in TLS mode.
    if [ "$ACCESS_IDX" != 3 ]; then printf '  caddy:\n    profiles: ["disabled"]\n'; fi
    if [ "$ACCESS_IDX" = 2 ]; then
      for svc in $EXPOSE_PORTS; do
        name=${svc%%:*}; cport=${svc##*:}; host=${svc#*:}; host=${host%%:*}
        # !override replaces the base list instead of appending to it —
        # appending would try to bind 127.0.0.1:P and 0.0.0.0:P at once.
        printf '  %s:\n    ports: !override\n      - "0.0.0.0:%s:%s"\n' "$name" "$host" "$cport"
        # Grafana builds absolute redirect URLs from GF_SERVER_ROOT_URL. Left
        # at the reference box's sslip.io host, every login bounces to a name
        # that does not resolve — and the failure looks like a broken password.
        if [ "$name" = grafana ]; then
          printf '    environment:\n      GF_SERVER_ROOT_URL: "http://%s:%s"\n' "$PUBLIC_IP" "$host"
        fi
      done
    elif [ "$ACCESS_IDX" = 1 ]; then
      # The dashboard and the ingest bridge publish no host port at all in the
      # base compose — they are reached only through Caddy. With Caddy off they
      # need a loopback binding or they are unreachable even over a tunnel.
      printf '  plant-ingest:\n    ports: !override\n      - "127.0.0.1:8088:8080"\n'
      if [ "$ANALYTICS_IDX" = 1 ]; then
        printf '  plant-dashboard:\n    ports: !override\n      - "127.0.0.1:8501:8501"\n'
        printf '  grafana:\n    environment:\n      GF_SERVER_ROOT_URL: "http://localhost:3000"\n'
      fi
    fi
  )
  if [ -z "$body" ]; then
    rm -f "$f"   # a stale one from a previous run with different answers
    info "this mode needs no compose override"
    return 0
  fi
  {
    echo "# Generated by self-hosting/any-vm/install.sh — regenerate, do not hand-edit."
    echo "services:"
    printf '%s\n' "$body"
  } >"$f"
  ok "wrote $f"
}

configure_caddy() {
  [ "$ACCESS_IDX" = 3 ] || return 0
  # Certificates are per-hostname, so the reference box's sslip.io names in the
  # vendored Caddyfile (and Grafana's GF_SERVER_ROOT_URL) become this VM's.
  run sed -i "s/reference-host/$IP_DASHED/g" "$STREAM_DIR/caddy/Caddyfile" "$STREAM_DIR/docker-compose.yml"
  # Caddy's basic_auth wants a bcrypt hash, which only the caddy image produces.
  UI_PW=$(gen_password); DASH_PW=$(gen_password)
  if ! dry; then
    umask 077
    {
      printf 'STREAMING_UI_PASSWORD=%s\n' "$UI_PW"
      printf 'STREAMING_UI_HASH=%s\n' "$($SUDO docker run --rm caddy:2-alpine caddy hash-password --plaintext "$UI_PW")"
      printf 'DASH_UI_PASSWORD=%s\n' "$DASH_PW"
      printf 'DASH_UI_HASH=%s\n' "$($SUDO docker run --rm caddy:2-alpine caddy hash-password --plaintext "$DASH_PW")"
    } >>"$STREAM_DIR/.env"
  fi
  ok "Caddyfile pointed at *.$IP_DASHED.sslip.io"
}

wait_for_kafka() {
  info "waiting for Kafka to become healthy"
  [ "$DRY_RUN" = yes ] && return 0
  local i
  for i in $(seq 1 40); do
    $SUDO docker exec kafka /opt/kafka/bin/kafka-broker-api-versions.sh \
      --bootstrap-server localhost:9092 >/dev/null 2>&1 && { ok "Kafka is up"; return 0; }
    sleep 5
  done
  die "Kafka did not come up in 200s — check: cd $STREAM_DIR && docker compose logs kafka"
}

create_topics() {
  info "creating topics (auto-create is off by design)"
  local t
  for t in $TOPICS; do
    # RF 1: a single broker cannot replicate, and a higher RF does not error —
    # topic creation simply blocks forever waiting for replicas.
    run $SUDO docker exec kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 \
      --create --if-not-exists --topic "$t" --partitions "$PARTS" --replication-factor 1
  done
  ok "$(echo "$TOPICS" | wc -w | tr -d ' ') topics, $PARTS partitions, RF 1"
}

apply_clickhouse_schemas() {
  info "waiting for ClickHouse, then applying schemas"
  local i pw
  if [ "$DRY_RUN" = no ]; then
    for i in $(seq 1 40); do
      curl -fsS http://127.0.0.1:8123/ping >/dev/null 2>&1 && break
      sleep 5
    done
    pw=$(grep '^CLICKHOUSE_PASSWORD=' "$STREAM_DIR/.env" | cut -d= -f2-)
    for i in plant-risk/clickhouse/plant_risk.sql plant-risk/clickhouse/notifier_tables.sql \
             plant-risk/clickhouse/dlq_redrive.sql examples/observability.sql; do
      $SUDO docker exec -i clickhouse clickhouse-client --password "$pw" --multiquery <"$STREAM_DIR/$i" \
        || warn "schema $i failed to apply — re-run it by hand"
    done
  fi
  ok "ClickHouse schemas applied"
}

apply_ufw() {
  [ "${UFW:-no}" = yes ] || return 0
  local svc
  for svc in $EXPOSE_PORTS; do
    run $SUDO ufw allow from "$ADMIN_IP" to any port "$(echo "$svc" | cut -d: -f2)" proto tcp
  done
  ok "ufw now allows the exposed ports from $ADMIN_IP only (ufw status to verify)"
}

# ============================================================================
# 5. execute — batch
# ============================================================================
install_batch() {
  banner "Installing Airflow 3.3"
  run $SUDO mkdir -p "$TARGET"
  run $SUDO chown -R "$(id -u):$(id -g)" "$TARGET"
  # Every path the compose file bind-mounts must exist first, or docker creates
  # it root-owned and the (uid 0) containers still work while `git pull` here
  # does not. notebooks/ is the one that is easy to forget — DAG 10 needs it.
  run mkdir -p "$TARGET/logs" "$TARGET/plugins" "$TARGET/config" "$TARGET/data" "$TARGET/notebooks"
  run rsync -a --delete --exclude='__pycache__' "$REPO_ROOT/dags/" "$TARGET/dags/"
  if [ -d "$REPO_ROOT/notebooks" ]; then
    run rsync -a --exclude='__pycache__' "$REPO_ROOT/notebooks/" "$TARGET/notebooks/"
  fi
  run cp "$REPO_ROOT/Dockerfile" "$TARGET/Dockerfile"
  run cp "$REPO_ROOT/deploy/airflow-docker-compose.yaml" "$TARGET/docker-compose.yaml"

  AIRFLOW_PW=$(gen_password)
  if [ "$DRY_RUN" = no ]; then
    umask 077
    {
      # AIRFLOW_UID=0 is why the CLI needs HOME=/home/airflow — see AGENTS.md.
      printf 'AIRFLOW_UID=0\nAIRFLOW_PROJ_DIR=.\n'
      printf '_AIRFLOW_WWW_USER_USERNAME=airflow\n_AIRFLOW_WWW_USER_PASSWORD=%s\n' "$AIRFLOW_PW"
      # Changing the Fernet key later makes every stored connection password
      # unreadable, so it is generated once and never rotated by this script.
      printf 'FERNET_KEY=%s\n' "$(openssl rand -base64 32 | tr '+/' '-_')"
      if [ "$STORAGE_IDX" = 2 ]; then
        printf 'AWS_ACCESS_KEY_ID=%s\nAWS_SECRET_ACCESS_KEY=%s\n' "$S3_KEY" "$S3_SECRET"
        printf 'AWS_ENDPOINT_URL_S3=%s\nPIPELINE_BUCKET=%s\n' "$S3_ENDPOINT" "$S3_BUCKET"
      else
        printf 'PIPELINE_DATA_DIR=/opt/airflow/data\n'
      fi
    } >"$TARGET/.env"
    chmod 600 "$TARGET/.env"
  fi
  ok "wrote $TARGET/.env (mode 600)"

  if [ "$ACCESS_IDX" = 1 ]; then
    run bash -c "printf 'services:\n  airflow-apiserver:\n    ports: !override\n      - \"127.0.0.1:8080:8080\"\n' >'$TARGET/docker-compose.override.yml'"
  fi

  info "building the Airflow image and initialising the metadata DB"
  in_dir "$TARGET" "$SUDO docker compose build"
  in_dir "$TARGET" "$SUDO docker compose up airflow-init"
  in_dir "$TARGET" "$SUDO docker compose up -d"
  ok "Airflow is starting — DAGs arrive PAUSED, by design"
}

# ============================================================================
# 6. summary
# ============================================================================
envval() { grep "^$1=" "$2" 2>/dev/null | cut -d= -f2- || true; }

write_summary() {
  local f="$TARGET/ACCESS.md" tmp
  tmp=$(mktemp)
  summary_body >"$tmp"
  banner "YOUR ACCESS DETAILS"
  cat "$tmp"
  printf '\n'
  run cp "$tmp" "$f"
  run chmod 600 "$f"
  rm -f "$tmp"
  ok "also saved to $f (mode 600 — it contains every password)"
}

summary_body() {
  printf '# %s — access details\n\nGenerated %s by self-hosting/any-vm/install.sh.\n\n' "$NAME" "$(date -u '+%Y-%m-%d %H:%M UTC')"
  if [ "$PIPELINE_IDX" = 1 ]; then summary_realtime; else summary_batch; fi
  printf '\n## Everyday commands\n\n```bash\ncd %s%s\n' "$TARGET" "$([ "$PIPELINE_IDX" = 1 ] && echo /streaming)"
  if [ "$PIPELINE_IDX" = 1 ] && [ -n "$ACTIVE_PROFILES" ]; then
    # Without this, compose does not consider the profiled services at all and
    # `stop`/`down` quietly leave them running.
    printf 'export COMPOSE_PROFILES=%s   # so compose sees the profiled services\n' "$ACTIVE_PROFILES"
  fi
  printf 'docker compose ps                 # what is running\ndocker compose logs -f <service>  # follow one service\ndocker compose stop               # stop, keep the data\nbash %s/uninstall.sh %s           # remove it all\n```\n' "$HERE" "$TARGET"
}

summary_realtime() {
  local e="$STREAM_DIR/.env"
  printf '## URLs\n\n'
  case "$ACCESS_IDX" in
    1)
      printf 'Nothing is published beyond 127.0.0.1. Tunnel from your laptop:\n\n```bash\nssh -N \\\n'
      # 8501 and 8088 are loopback-published by the override written above:
      # in the base compose they are reachable only through Caddy, which this
      # mode disables.
      if [ "$ANALYTICS_IDX" = 1 ]; then
        printf '  -L 8501:127.0.0.1:8501 \\\n  -L 3000:127.0.0.1:3000 \\\n  -L 8123:127.0.0.1:8123 \\\n'
      fi
      printf '  -L 8081:127.0.0.1:8081 \\\n  -L 8082:127.0.0.1:8082 \\\n  -L 8088:127.0.0.1:8088 \\\n'
      printf '  %s@%s\n```\n\n' "$(id -un)" "${PUBLIC_IP:-<this-ip>}"
      printf '| UI | URL once tunnelled |\n|---|---|\n'
      if [ "$ANALYTICS_IDX" = 1 ]; then
        printf '| Streamlit dashboard | http://localhost:8501 |\n| Grafana | http://localhost:3000 |\n| ClickHouse /play | http://localhost:8123/play |\n'
      fi
      printf '| Kafka UI | http://localhost:8081 |\n| Flink | http://localhost:8082 |\n| Ingest bridge | http://localhost:8088 |\n'
      ;;
    2)
      printf '**No TLS on any of these.** Treat every password below as sent in clear text.\n\n'
      printf '| UI | URL |\n|---|---|\n'
      local svc port
      for svc in $EXPOSE_PORTS; do
        port=$(echo "$svc" | cut -d: -f2)
        printf '| %s | http://%s:%s |\n' "$(echo "$svc" | cut -d: -f1)" "$PUBLIC_IP" "$port"
      done
      printf '\nEverything else stays on 127.0.0.1 — tunnel for it (`ssh -N -L 8123:127.0.0.1:8123 %s@%s`).\n' "$(id -un)" "$PUBLIC_IP"
      ;;
    3)
      printf '| UI | URL | Login |\n|---|---|---|\n'
      printf '| Streamlit dashboard | https://dash.%s.sslip.io | admin / `%s` |\n' "$IP_DASHED" "$(envval DASH_UI_PASSWORD "$e")"
      printf '| Grafana | https://grafana.%s.sslip.io | admin / see below |\n' "$IP_DASHED"
      printf '| ClickHouse /play | https://clickhouse.%s.sslip.io/play | viewer / see below |\n' "$IP_DASHED"
      printf '| Kafka UI | https://kafka.%s.sslip.io | admin / `%s` |\n' "$IP_DASHED" "$(envval STREAMING_UI_PASSWORD "$e")"
      printf '| Flink | https://flink.%s.sslip.io | admin / same as Kafka UI |\n' "$IP_DASHED"
      printf '| Ingest bridge | https://ingest.%s.sslip.io | `Authorization: Bearer <ingest key>` |\n' "$IP_DASHED"
      printf '\nCertificates take ~30s on first request. If they fail, 80/443 are not reachable from the internet.\n'
      ;;
  esac

  printf '\n## Credentials\n\nAll of these live in `%s` (mode 600).\n\n' "$e"
  printf '| What | Value |\n|---|---|\n'
  if [ "$ANALYTICS_IDX" = 1 ]; then
    printf '| Grafana admin | admin / `%s` |\n' "$(envval GRAFANA_ADMIN_PASSWORD "$e")"
    printf '| ClickHouse viewer (read-only) | viewer / `%s` |\n' "$(envval CLICKHOUSE_VIEWER_PASSWORD "$e")"
    printf '| ClickHouse admin | default / `%s` |\n' "$(envval CLICKHOUSE_PASSWORD "$e")"
  fi
  if [ "$PLANTRISK" = yes ]; then
    printf '| Postgres (plant master data) | plant / `%s` (127.0.0.1:15432) |\n' "$(envval PLANT_PG_PASSWORD "$e")"
  fi
  printf '| Ingest API key | `Authorization: Bearer %s` |\n' "$(envval INGEST_API_KEY "$e")"

  if [ "$ANALYTICS_IDX" = 2 ]; then
    cat <<EOF

## DuckDB mode

No Grafana, no Streamlit, no ClickHouse — that is the trade you took for the
smaller footprint. The sink writes one table per topic to
\`$STREAM_DIR/data/plant.duckdb\`, payloads stored as JSON:

\`\`\`bash
docker exec -it duckdb-sink python -c \\
  "import duckdb; print(duckdb.connect('/data/plant.duckdb').sql('SHOW TABLES'))"

# or with the duckdb CLI on the host (apt-get install duckdb):
duckdb $STREAM_DIR/data/plant.duckdb \\
  -c "SELECT payload->>'equipment_id', count(*) FROM \"plant.risk.scores\" GROUP BY 1"
\`\`\`

DuckDB is single-writer: stop the sink before opening the file read-write.
EOF
  fi

  printf '\n## Off by default\n\n'
  if [ "$ANALYTICS_IDX" = 1 ]; then
    printf -- '- **Email alerts** — `EMAIL_ENABLED=false`. Set `RESEND_API_KEY` in `.env`, or flip it live from the dashboard Notifier tab.\n'
    printf -- '- **Claude RCA narratives** — `RCA_ENABLED=false`. Needs `ANTHROPIC_API_KEY`.\n'
    printf -- '- **Flink jobs** — the cluster is up with no job submitted. ClickHouse ingests through its own Kafka table engine.\n'
  else
    printf -- '- **The notifier** (email + Claude RCA) is disabled entirely: it reads its evidence from ClickHouse.\n'
    printf -- '- **Flink jobs** — the cluster is up with no job submitted.\n'
  fi
}

summary_batch() {
  printf '## URL\n\n'
  if [ "$ACCESS_IDX" = 1 ]; then
    printf '```bash\nssh -N -L 8080:127.0.0.1:8080 %s@%s\n```\n\nThen http://localhost:8080\n' "$(id -un)" "${PUBLIC_IP:-<this-ip>}"
  else
    printf 'http://%s:8080 — **plain HTTP, no TLS.**\n' "$PUBLIC_IP"
  fi
  printf '\n## Credentials\n\n| What | Value |\n|---|---|\n'
  printf '| Airflow UI | airflow / `%s` |\n' "$AIRFLOW_PW"
  printf '| Metadata Postgres | airflow / airflow (container-internal only) |\n'
  printf '\nEnv file: `%s/.env` (mode 600). Fernet key lives there — changing it makes\nevery stored connection password unreadable.\n' "$TARGET"
  if [ "$STORAGE_IDX" = 2 ]; then
    printf '\nOutputs go to `s3://%s` at `%s` via `AWS_*` in the env file.\n' "$S3_BUCKET" "$S3_ENDPOINT"
  else
    printf '\nOutputs go to `%s/data`, mounted into the containers at `/opt/airflow/data`.\n' "$TARGET"
  fi
  printf '\n## First steps\n\n- DAGs arrive **paused** — deployment and activation are separate on purpose.\n'
  printf '- `alias af='"'"'docker exec -e HOME=/home/airflow %s-airflow-scheduler-1 airflow'"'"'` (the CLI needs HOME set)\n' "$(basename "$TARGET")"
  printf '- `af dags list-import-errors` is the first thing to check.\n'
  printf '- Scheduler/worker containers show `(unhealthy)` — cosmetic, see AGENTS.md.\n'
}

# ============================================================================
main() {
  banner "Self-hosted install — this machine"
  preflight
  collect_prefs

  # Port conflicts are only knowable after the access mode is chosen.
  if [ "$PIPELINE_IDX" = 1 ]; then
    case "$ACCESS_IDX" in
      2) check_ports $(echo "$EXPOSE_PORTS" | tr ' ' '\n' | cut -d: -f2 | tr '\n' ' ') ;;
      3) check_ports 80 443 ;;
    esac
  else
    check_ports 8080
  fi

  build_plan
  plan_show
  plan_confirm

  if [ "$PIPELINE_IDX" = 1 ]; then install_realtime; else install_batch; fi
  write_summary
}

main "$@"
