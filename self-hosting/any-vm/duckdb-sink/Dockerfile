FROM python:3.12-slim
RUN pip install --no-cache-dir "kafka-python>=2.1" "duckdb>=1.1"
COPY consumer.py /app/consumer.py
VOLUME ["/data"]
ENTRYPOINT ["python", "-u", "/app/consumer.py"]
