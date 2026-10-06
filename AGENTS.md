# BinaryWebEngine - AGENTS.md

## Project Overview
Security operations dashboard: Cloudflare Worker (JS) API backend + Firebase Hosting frontend.

## Key Files

| File | Purpose |
|---|---|
| `worker/worker.js` | Main API worker - auth, routes, D1 queries, AI chat/explain, password tools, rate limiting |
| `frontend/app.js` | Dashboard frontend - renders all tabs, API calls via `req()` with token auth |
| `frontend/index.html` | Dashboard HTML template |
| `frontend/login.html` | Login page - POSTs to `/login?ajax=1`, stores token in localStorage |
| `db/mockdata.sql` | D1 seed data - 260 alerts, traffic_log, waf_events, processes, login_events, etc. |

## Architecture

- Worker proxies static files from Firebase Hosting
- All API routes require `X-Session-Token` header or `bwe_session` cookie
- Sessions are in-memory (`VALID_SESSIONS Map`) - wiped on every deploy
- AI uses `NVIDIA_API_KEY` secret (set via `wrangler secret put`)
- Rate limiting: 10 AI requests/minute per session
- CORS headers allow cross-origin access from alternate frontend hosts
- API keys (ipinfo, abuseipdb, virustotal) stored in KV via `/config/api-keys`

## Common Tasks

**Add new API route:** Add an `if (path === '/my/route')` block in `handleRequest()` before the fallback 404

**Modify seed data:** Edit `db/mockdata.sql` then run `wrangler d1 execute bwe-mock --file=db/mockdata.sql --remote`

**Deploy:** `npx wrangler deploy` from `worker/` directory

**Deploy frontend:** `npx firebase deploy --only hosting` from `frontend/` directory

**Change admin password:** Edit `DEMO_PASS` in `worker/worker.js`, then redeploy

**Add frontend feature:** Add new tab in `index.html`, add click handler in nav, implement `render*()` function in `app.js`

## Database

D1 tables: alerts, traffic_log, waf_events, processes, network_events, login_events, file_hashes, quarantined_files, alert_explanations, alert_rules, waf_custom_rules

KV keys: `api_keys_config`, `audit_trail.jsonl`

## Credentials

Login: `admin` / `ci;r.Sp,BPbA)qHjtsa3#9Mv`
