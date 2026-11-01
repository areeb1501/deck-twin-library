# Self-hosting the streaming stack

> **Reference code.** This is how the data engine is deployed. It predates the hackathon, and it needs the engine's `streaming/` source next to it, which is not in this repo. Refer to it and adjust it for your own setup. It has not been run from this repo.

Interactive deploy wizards for running the `streaming/` pipeline
(**Kafka → Flink 1.20 → ClickHouse**, with Postgres master data, the
plant-risk services, Streamlit + Grafana dashboards, Caddy TLS front door)
on your own cloud account.

```
self-hosting/
├── lib/common.sh     shared wizard helpers (prompts, sizing, plan gate)
├── aws/deploy.sh     AWS wizard  (self-hosted EC2  | managed MSK et al.)
├── azure/deploy.sh   Azure wizard (self-hosted VM   | managed Event Hubs et al.)
├── gcp/deploy.sh     GCP wizard  (self-hosted GCE  | managed Kafka et al.)
└── any-vm/install.sh runs ON any Linux VM you already own (self-hosted only)
```

Each cloud folder also contains its supporting files (cloud-init, templates,
`teardown.sh`). Run a wizard from the repo root:

```bash
bash self-hosting/aws/deploy.sh
```

## How the wizard works

1. Asks for your preferences: deployment name, region, estimated
   **events/second** (drives VM sizing and Kafka partition counts), number of
   VMs / replication, which profiles to enable, optional API keys.
2. Prints a full **deployment plan** — every resource it would create, with
   sizes and estimated monthly cost.
3. Creates nothing until you literally type `deploy`.

`any-vm/` is different from the cloud wizards: you copy the repo onto a VM
you already own and run `install.sh` **on that machine**. It preflights the
hardware (dies with the exact missing spec if the VM is too small), asks
batch (Airflow) vs real-time (this streaming stack), offers DuckDB as a
lightweight alternative to ClickHouse, lets you choose plain-IP:port access
instead of a domain, and finishes by printing every URL and credential.

## Two modes per cloud

**Fully self-hosted** — this exact stack, byte for byte: the wizard provisions
VM(s), installs Docker via cloud-init, copies `streaming/` up, generates
secrets into `.env`, runs `docker compose up`, and creates the Kafka topics.
Multi-VM adds Kafka replication (RF 3) and splits roles.

**Managed services** — the same pipeline shape on managed lookalikes:

| Component  | AWS                        | Azure                        | GCP (lift-and-shift)         |
|------------|----------------------------|------------------------------|------------------------------|
| Kafka      | MSK Serverless             | Event Hubs (Kafka API)       | Managed Service for Kafka    |
| Flink      | Managed Service for Flink  | container-hosted Flink       | Flink on a small GCE VM      |
| ClickHouse | ClickHouse Cloud (BYO key) | ClickHouse Cloud (BYO key)   | ClickHouse Cloud (BYO key)   |
| Postgres   | RDS                        | Flexible Server              | Cloud SQL                    |
| Consumers  | ECS Fargate / Lambda       | Container Apps / Functions   | Cloud Run                    |
| Dashboards | Managed Grafana            | Managed Grafana              | Grafana on Cloud Run         |
| Storage    | S3                         | Blob Storage                 | GCS                          |

There is no first-party managed ClickHouse on any of the three — the wizards
take a ClickHouse Cloud API key, or fall back to ClickHouse on a small VM.

**GCP has a third mode: cloud-native managed** — not the same stack on
managed hosts, but the GCP-native equivalents: Pub/Sub for the bus (topic
names carry over verbatim), Dataflow in place of Flink (the PyFlink jobs
need porting to Apache Beam; the wizard sets up staging and prints the
submit command rather than pretending to deploy), BigQuery as the warehouse
(tables translated from the ClickHouse schemas, TTLs become partition
expiries), Cloud Run consumers with a ready-made Pub/Sub→BigQuery sink,
GCS for artifacts, Secret Manager for credentials. No VMs and no Caddy —
Cloud Run terminates HTTPS itself, and only the ingest door is public.

## Security posture (all clouds, both modes)

- No service is ever exposed on `0.0.0.0` except the TLS proxy (80/443).
  Kafka, ClickHouse, Flink, Postgres stay on private IPs / loopback.
- SSH is restricted to the IP you run the wizard from.
- Secrets are **generated, not prompted**, stored in the cloud's secret
  manager (managed mode) or a `chmod 600` `.env` on the VM (self-hosted).
- Data services get private networking / VPC peering where the cloud
  supports it; nothing managed is provisioned with public access.

## Testing locally without a cloud account

- **AWS** — [LocalStack](https://localstack.cloud): `deploy.sh --emulate`
  points the AWS CLI at `http://localhost:4566`.
- **Azure** — no full-control-plane emulator exists; the closest is
  `deploy.sh --dry-run`, which prints every `az` command instead of running it.
- **GCP** — same: `--dry-run` prints every `gcloud` command.

All three wizards support `--dry-run` regardless.
