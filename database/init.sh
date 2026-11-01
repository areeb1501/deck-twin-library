#!/usr/bin/env bash
# Creates the Deck Twin tables and reference data in D1. Local by default; pass --remote for the real database.
# Usage: ./database/init.sh [--remote] [database-name]
set -euo pipefail

cd "$(dirname "$0")/.."

target=--local
if [[ "${1:-}" == "--remote" ]]; then
  target=--remote
  shift
fi
name="${1:-deck-twin}"

npx wrangler d1 execute "$name" "$target" --yes --file database/schema.sql
npx wrangler d1 execute "$name" "$target" --yes --file database/seed.sql
npx wrangler d1 execute "$name" "$target" --command "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name"
