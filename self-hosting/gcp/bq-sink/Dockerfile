FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY main.py .

# Unbuffered: Cloud Logging only shows what the process actually flushed, and
# a crash loop with a full stdout buffer looks like a silent failure.
ENV PYTHONUNBUFFERED=1
CMD ["python", "main.py"]
