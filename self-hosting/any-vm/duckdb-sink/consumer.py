#!/usr/bin/env python3
"""Kafka -> DuckDB sink for the lightweight (no-ClickHouse) install mode.

Replaces ClickHouse's Kafka table engine with the smallest thing that works:
one consumer, one embedded file. There is no server, no cluster, no dashboards
-- query the file with the duckdb CLI. That is the trade: ~2 GB of RAM back in
exchange for losing Grafana and the Streamlit dashboard.

Rows are stored as (ingested_at, payload JSON) rather than a typed schema, so a
producer-side field change can never wedge ingestion. Query with DuckDB's JSON
operators:  SELECT payload->>'equipment_id' FROM "plant.risk.scores";
"""
import datetime as dt
import json
import os
import time

import duckdb
from kafka import KafkaConsumer

DB_PATH = os.environ.get("DUCKDB_PATH", "/data/plant.duckdb")
BOOTSTRAP = os.environ.get("KAFKA_BOOTSTRAP", "kafka:9092")
TOPICS = [t for t in os.environ.get("TOPICS", "").split(",") if t]
BATCH_ROWS = int(os.environ.get("BATCH_ROWS", "500"))
FLUSH_SECONDS = float(os.environ.get("FLUSH_SECONDS", "5"))

con = duckdb.connect(DB_PATH)
for topic in TOPICS:
    con.execute(f'CREATE TABLE IF NOT EXISTS "{topic}" (ingested_at TIMESTAMP, payload JSON)')

consumer = KafkaConsumer(
    *TOPICS,
    bootstrap_servers=BOOTSTRAP,
    group_id="duckdb-sink",
    auto_offset_reset="latest",
    # Offsets are committed only after the insert lands, so a crash replays the
    # last batch instead of losing it. At-least-once, deliberately.
    enable_auto_commit=False,
    value_deserializer=lambda b: b.decode("utf-8", "replace"),
)

pending = {topic: [] for topic in TOPICS}
last_flush = time.monotonic()
total = 0


def flush():
    global last_flush, total
    wrote = 0
    for topic, rows in pending.items():
        if rows:
            con.executemany(f'INSERT INTO "{topic}" VALUES (?, ?)', rows)
            wrote += len(rows)
            rows.clear()
    if wrote:
        consumer.commit()
        total += wrote
        print(f"flushed {wrote} rows ({total} total) -> {DB_PATH}", flush=True)
    last_flush = time.monotonic()


print(f"duckdb-sink: {BOOTSTRAP} {TOPICS} -> {DB_PATH}", flush=True)
while True:
    batches = consumer.poll(timeout_ms=1000, max_records=BATCH_ROWS)
    for tp, messages in batches.items():
        for msg in messages:
            try:
                json.loads(msg.value)  # malformed events are dropped, not stored
            except ValueError:
                continue
            ts = dt.datetime.fromtimestamp(msg.timestamp / 1000.0, dt.timezone.utc)
            pending[tp.topic].append((ts, msg.value))

    queued = sum(len(rows) for rows in pending.values())
    if queued >= BATCH_ROWS or (queued and time.monotonic() - last_flush >= FLUSH_SECONDS):
        flush()
