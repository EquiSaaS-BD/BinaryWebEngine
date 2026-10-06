#!/bin/bash
# BinaryWebEngine · KV Seeder
# Seeds audit trail and API keys config into KV namespace
set -e

echo "=== Seeding KV Namespace ==="
npx wrangler kv key put --binding=AUDIT_TRAIL "audit_trail.jsonl" "$(cat <<'JSONL'
{"event":"system_init","actor":"system","timestamp":"2025-01-01T00:00:00Z","action":"dashboard_initialized"}
{"event":"user_login","actor":"admin","timestamp":"2025-01-01T00:00:01Z","action":"login_success","ip":"127.0.0.1"}
JSONL
)" --remote

echo "KV seeded successfully"
