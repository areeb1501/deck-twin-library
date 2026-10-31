# Install on a VM you already own

The other wizards in `self-hosting/` run on your laptop and provision cloud
resources. This one runs **on the target machine** — bare metal, a Proxmox
guest, a random VPS. Self-hosted only; there is no managed option.

```bash
git clone <this repo> ~/stack && cd ~/stack
bash self-hosting/any-vm/install.sh          # add --dry-run to see the commands first
```

It asks nine or ten questions, prints the full plan, and installs nothing until
you type `deploy`.

## What it does

1. **Preflight** — Linux + x86_64/arm64, cores, RAM, free disk, Docker (offers
   to install it on Debian/Ubuntu), Compose ≥ 2.24, and whether the ports it
   needs are free. Dies with the exact missing spec rather than half-installing.
2. **Asks** — real-time streaming or batch Airflow; events/second; ClickHouse or
   DuckDB; which profiles; and how you want to reach the UIs.
3. **Installs** — copies `streaming/` (or `dags/` + `deploy/`) to `/opt/<name>`,
   generates every secret into a `chmod 600` `.env`, writes a compose override
   for the access mode you picked, builds, and creates the Kafka topics.
4. **Tells you everything** — a full access block printed at the end and saved
   to `/opt/<name>/ACCESS.md`: every URL, every password, what is off by default.

## Minimum specs

Checked twice: an absolute floor before any questions, then against the real
requirement of whatever you chose.

| Choice | Cores | RAM (recommended) | RAM (hard floor) | Free disk |
|---|---|---|---|---|
| Absolute floor, checked upfront | 2 | 4 GB | 4 GB | 20 GB |
| Real-time — ClickHouse, full dashboards | 2 | 8 GB | 6 GB | 40 GB |
| Real-time — DuckDB, no dashboards | 2 | 6 GB | 4 GB | 30 GB |
| Batch — Airflow 3.3 CeleryExecutor | 2 | 4 GB | 4 GB | 20 GB |

Below the recommendation but above the floor you get a warning and a chance to
back out — the compose `mem_limit`s sum to ~9 GB for the ClickHouse path, and it
does run below that with swap, just slowly. Below the floor it dies.

Above ~5000 events/second the wizard warns if the core count does not match the
tier. Kafka replication is 1 either way: one broker cannot replicate, and a
higher RF does not error — topic creation simply blocks forever.

## The two honest trade-offs

**DuckDB mode** drops ClickHouse, Grafana, the Streamlit dashboard and the alert
notifier (it reads its evidence from ClickHouse). What you get instead is a
~60-line consumer writing one table per topic into a single
`streaming/data/plant.duckdb` file, queried with the `duckdb` CLI. That is ~2 GB
of RAM back in exchange for every dashboard in the project.

**Plain IP + ports mode** skips Caddy entirely and rebinds the UIs you pick from
`127.0.0.1` to `0.0.0.0`. There is no TLS — passwords and the ingest API key
cross the network in clear text. The Kafka UI has no authentication and grants
full topic delete; Flink has none either and its REST API accepts job uploads,
which is remote code execution on the host. The installer says so, defaults to
dashboards-only, and offers to write `ufw` rules restricting the ports to your
IP. The default access mode remains localhost-only over an SSH tunnel.

## Removing it

```bash
bash self-hosting/any-vm/uninstall.sh /opt/<name>
```

Confirms by making you type `uninstall`, then asks separately before deleting
the data volumes and again before deleting the directory. Docker is left
installed and `ufw` rules are left alone.
