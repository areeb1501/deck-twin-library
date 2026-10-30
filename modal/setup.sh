#!/usr/bin/env bash
# Puts SAM 3.1 on the linked Modal account (modal/PLAN.md). Safe to run again.
#
#   ./setup.sh
#
# Needs: the modal CLI logged in, and a `huggingface-secret` Modal secret whose token has access to facebook/sam3.1.
# Writes: modal/.env.local (git-ignored) with the endpoint URL and a key made here. The key is never printed.
set -euo pipefail
cd "$(dirname "$0")"

ENV_FILE=.env.local
WORKSPACE="$(modal profile current)"
URL="https://${WORKSPACE}--deck-twin-sam31.modal.run"

if ! grep -q '^DECK_TWIN_API_KEY=' "$ENV_FILE" 2>/dev/null; then
  umask 077
  echo "DECK_TWIN_API_KEY=$(openssl rand -hex 32)" >> "$ENV_FILE"
fi
grep -q '^DECK_TWIN_SAM_URL=' "$ENV_FILE" || echo "DECK_TWIN_SAM_URL=$URL" >> "$ENV_FILE"
chmod 600 "$ENV_FILE"

SECRET_FILE="$(mktemp)"
trap 'rm -f "$SECRET_FILE"' EXIT
grep '^DECK_TWIN_API_KEY=' "$ENV_FILE" > "$SECRET_FILE"
echo 'DECK_TWIN_ORIGINS=http://localhost:5173' >> "$SECRET_FILE"
modal secret create --force --from-dotenv "$SECRET_FILE" deck-twin-gateway > /dev/null
echo "secret deck-twin-gateway is set"

modal run sam31.py::download_weights
modal run sam31.py::inspect_weights
modal deploy sam31.py

echo "deployed: $URL"
echo "smoke test: python smoke.py"
