"""Pub/Sub -> BigQuery sink for the cloud-native deployment.

Stands in for the ClickHouse Kafka engine + materialized views, which have no
BigQuery equivalent: BigQuery cannot subscribe to anything, so something has to
pull. This is that something, and it is deliberately the simplest thing that
works — one row per message, no windowing, no joins. The Beam/Dataflow port
does the real streaming work; this keeps the tables filling until it exists.

Config (all from the environment, set by deploy.sh):
  GCP_PROJECT   project id
  BQ_DATASET    dataset name, default plant_risk
  SINK_MAP      "subscription_id:table,subscription_id:table,..."
"""

import json
import os
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

from google.cloud import bigquery, pubsub_v1

PROJECT = os.environ["GCP_PROJECT"]
DATASET = os.environ.get("BQ_DATASET", "plant_risk")
SINK_MAP = os.environ["SINK_MAP"]

bq = bigquery.Client(project=PROJECT)
subscriber = pubsub_v1.SubscriberClient()


def make_callback(table):
    ref = "{}.{}.{}".format(PROJECT, DATASET, table)

    def callback(message):
        try:
            row = json.loads(message.data)
        except (json.JSONDecodeError, UnicodeDecodeError):
            # Malformed payloads are the pipeline's whole point, but they are
            # already captured on the DLQ topic by the risk engine. Acking here
            # rather than nacking stops one bad message looping forever.
            message.ack()
            return
        # row_ids makes the insert best-effort idempotent: Pub/Sub is
        # at-least-once, so a redelivery would otherwise duplicate the row.
        errors = bq.insert_rows_json(ref, [row], row_ids=[message.message_id])
        if errors:
            print("insert failed for {}: {}".format(ref, errors), flush=True)
            message.nack()
        else:
            message.ack()

    return callback


class Health(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"ok")

    def log_message(self, *args):
        pass  # the streaming pull is the interesting log, not health probes


def main():
    for pair in SINK_MAP.split(","):
        sub_id, table = pair.split(":")
        path = subscriber.subscription_path(PROJECT, sub_id)
        # Flow control caps in-flight messages so a backlog cannot OOM the
        # container: BigQuery's streaming quota is the real bottleneck anyway.
        subscriber.subscribe(
            path,
            callback=make_callback(table),
            flow_control=pubsub_v1.types.FlowControl(max_messages=500),
        )
        print("sinking {} -> {}".format(sub_id, table), flush=True)

    # Cloud Run kills a container with no listener on $PORT. The pulls run on
    # subscriber threads; this only exists to keep the service alive, which
    # also requires --no-cpu-throttling (CPU is otherwise revoked between
    # requests and the background threads simply stop).
    HTTPServer(("", int(os.environ.get("PORT", "8080"))), Health).serve_forever()


if __name__ == "__main__":
    main()
