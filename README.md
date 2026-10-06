<div align="center">

# BinaryWebEngine

### Enterprise Linux Security Monitoring Platform

[![Live Demo](https://img.shields.io/badge/Live%20Demo-binarywebengine.web.app-8B0000?style=for-the-badge&logo=firebase)](https://binarywebengine.web.app)
[![API](https://img.shields.io/badge/API-bwe--api.workers.dev-F38020?style=for-the-badge&logo=cloudflare)](https://bwe-api.k-makmanhossain.workers.dev)
[![License](https://img.shields.io/badge/License-Proprietary-red?style=for-the-badge)]()
[![Version](https://img.shields.io/badge/Version-1.0.0-maroon?style=for-the-badge)]()

*Built by Team EquiSaaS BD for the International AI Builders Congress (InfraSphere Domain)*

</div>

---

## The Problem

Enterprise security teams are losing the fight against adversaries not because they lack tools, but because they have too many of them.

The average mid-size organization runs 45+ disconnected security products. Each product generates its own stream of alerts. A SIEM appliance ingests these streams, deduplicates them badly, and hands analysts a queue of 10,000 events per day. Analysts spend 60% of their time chasing false positives. Mean time to detect a breach sits at 197 days. Mean time to contain it: another 69 days.

The problem is architectural, not analytical. When detection, correlation, intelligence enrichment, and response tooling live in separate systems with separate APIs and separate UIs, the inevitable friction kills response speed. Attackers move in minutes; defenders move in days.

---

## The Solution

BinaryWebEngine collapses an entire security stack into a single deployable Linux engine with a real-time command center.

One binary. One dashboard. One truth.

The engine integrates a Web Application Firewall with 186 signatures, a file integrity monitor with inotify real-time detection, process and network monitoring, login monitoring across nine services, two-tier machine learning anomaly detection (Isolation Forest plus LSTM), Lockheed Martin kill chain reconstruction mapped to MITRE ATT&CK (TA0001-TA0010), AbuseIPDB threat intelligence, and an LLM-powered analysis assistant grounded in live system data. All of this runs as a single Python executable on any Linux server with 512 MB of RAM. No SIEM appliance. No third-party connectors. No five-figure licensing fees.

---

## Live Demo and Tech Stack

| Layer | Technology |
|---|---|
| Marketing Site | React 18, Vite 5, TypeScript, Framer Motion, Firebase Hosting |
| Demo Dashboard | Vanilla HTML/JS/CSS, ApexCharts, html2pdf.js |
| API Edge Layer | Cloudflare Workers (V8 Isolate, globally distributed) |
| Relational Data | Cloudflare D1 (SQLite on the edge, 11 tables) |
| Key-Value Store | Cloudflare Workers KV (API key config, audit trail) |
| Vector Layer | Cloudflare Vectorize (alert embedding pipeline) |
| Analysis Backend | Groq Llama 3 8B with Cohere fallback |
| Deployment | Wrangler CLI, Firebase CLI |

**Live URLs**
- Marketing site: https://binarywebengine.web.app
- Demo dashboard: https://binarywebengine.web.app/login.html
- Edge API: https://bwe-api.k-makmanhossain.workers.dev

---

## Local Setup and Run

### Prerequisites

```bash
node --version   # 18+
npm --version    # 9+
```

### 1. Clone the repository

```bash
git clone https://github.com/kholipha-ahmmad-al-amin/BinaryWebEngine.git
cd BinaryWebEngine
```

### 2. Edge API (Cloudflare Worker)

```bash
cd worker

# Authenticate with Cloudflare
npx wrangler login

# Create D1 database (first time only)
npx wrangler d1 create bwe-mock
# Copy the returned database_id into wrangler.jsonc -> d1_databases[0].database_id

# Create KV namespace (first time only)
npx wrangler kv namespace create AUDIT_TRAIL
# Copy the returned id into wrangler.jsonc -> kv_namespaces[0].id

# Seed the local database
npx wrangler d1 execute bwe-mock --local --file=../db/mockdata.sql

# Set secrets (never put these in wrangler.jsonc or source code)
npx wrangler secret put GROQ_API_KEY
npx wrangler secret put COHERE_API_KEY
npx wrangler secret put NVIDIA_API_KEY

# Start local dev server
npx wrangler dev
```

### 3. Marketing Site (React)

```bash
cd frontend-react
npm install
npm run dev
# Opens at http://localhost:5173
```

### 4. Seed the remote database

```bash
cd worker
npx wrangler d1 execute bwe-mock --remote --file=../db/mockdata.sql
```

### 5. Deploy everything

```bash
# Deploy Edge API
cd worker
npx wrangler deploy

# Deploy Marketing Site
cd ../frontend-react
npm run build
npx firebase deploy --only hosting --project binarywebengine-8133d
```

---

## Clean Git History (Single Production Commit)

Use this to wipe all history and create one clean commit:

```bash
# PowerShell (Windows)
Remove-Item -Recurse -Force .git

# bash (Linux/macOS)
# rm -rf .git

git init
git branch -M main
git add .
git commit -m "feat: Initial production release - BinaryWebEngine v1.0.0"
git remote add origin https://github.com/kholipha-ahmmad-al-amin/BinaryWebEngine.git
git push -u origin main --force
```

---

## Environment Variables

| Variable | Where Set | Purpose |
|---|---|---|
| `GROQ_API_KEY` | `wrangler secret put` | Primary LLM provider (Llama 3 8B on Groq) |
| `COHERE_API_KEY` | `wrangler secret put` | Fallback LLM provider (Command R) |
| `NVIDIA_API_KEY` | `wrangler secret put` | Optional NVIDIA NIM provider |
| `ENVIRONMENT` | `wrangler.jsonc vars` | Runtime environment flag (demo) |

Secrets are injected at deploy time via Wrangler and never appear in source code.

---

## System Documentation

### 1. System Architecture

```mermaid
graph TB
    subgraph Internet["External Traffic"]
        USER(["SOC Analyst"])
        ATTACKER(["Threat Actor"])
    end

    subgraph Firebase["Firebase Hosting CDN"]
        SITE["Marketing Site\nReact + Vite SPA"]
        DASH["Demo Dashboard\nHTML + JS + ApexCharts"]
        LOGIN["Login Page\nlogin.html"]
    end

    subgraph CF["Cloudflare Edge Network"]
        WORKER["Cloudflare Worker\nAPI Gateway + Auth\nbwe-api.workers.dev"]
        D1[("D1 Database\nSQLite on Edge\n11 Tables")]
        KV[("Workers KV\nAPI Keys + Audit Trail")]
        VEC[("Vectorize\nAlert Embeddings")]
    end

    subgraph PROVIDERS["External Providers"]
        GROQ["Groq API\nLlama 3 8B"]
        COHERE["Cohere API\nfallback"]
        ABUSE["AbuseIPDB\nIP Reputation"]
        IPINFO["IPInfo\nGeo + ASN"]
    end

    subgraph PRODUCT["Core Product - Linux Engine"]
        ENGINE["BinaryWebEngine\nPython Executable"]
        WAF["WAF\n186 Signatures"]
        FIM["File Integrity Monitor\ninotify + SHA-256"]
        PROC["Process Monitor\nheuristic scoring"]
        NET["Network Monitor\nconnection table"]
        ML["ML Anomaly Detection\nIsolation Forest + LSTM"]
        KC["Kill Chain Engine\nMITRE ATT&CK"]
    end

    USER --> SITE
    USER --> DASH
    ATTACKER --> WAF
    SITE --> WORKER
    DASH --> WORKER
    LOGIN --> WORKER
    WORKER --> D1
    WORKER --> KV
    WORKER --> VEC
    WORKER --> GROQ
    GROQ -.->|fallback| COHERE
    WORKER --> ABUSE
    WORKER --> IPINFO
    ENGINE --> WAF
    ENGINE --> FIM
    ENGINE --> PROC
    ENGINE --> NET
    ENGINE --> ML
    ENGINE --> KC
```

### 2. Entity-Relationship Diagram

```mermaid
erDiagram
    ALERTS {
        int id PK
        text timestamp
        text severity
        text module
        text title
        text ip_address
        text reason
        text evidence
        int resolved
        text source
    }
    TRAFFIC_LOG {
        int id PK
        text ip_address
        int hit_count
        text country
        int abuse_score
        int is_blocked
    }
    WAF_EVENTS {
        int id PK
        text timestamp
        text ip_address
        text attack_type
        text path
        int blocked
    }
    PROCESSES {
        int id PK
        int pid
        text name
        text cmdline
        float cpu_percent
        int is_suspicious
    }
    NETWORK_EVENTS {
        int id PK
        text remote_address
        int remote_port
        text process_name
        int is_suspicious
    }
    LOGIN_EVENTS {
        int id PK
        text ip_address
        text username
        text service
        text status
    }
    FILE_HASHES {
        int id PK
        text file_path
        text sha256_hash
        text permissions
    }
    QUARANTINED_FILES {
        int id PK
        text original_path
        text sha256_hash
        text reason
    }
    ALERT_EXPLANATIONS {
        int id PK
        int alert_id FK
        text explanation
        text model
    }
    ALERT_RULES {
        int id PK
        text name
        text severity
        text pattern
        text webhook_url
        int enabled
    }
    WAF_CUSTOM_RULES {
        int id PK
        text name
        text pattern
        int enabled
    }

    ALERTS ||--o{ ALERT_EXPLANATIONS : "explained by"
    ALERTS }o--o{ WAF_EVENTS : "correlated from"
    ALERTS }o--o{ LOGIN_EVENTS : "triggered by"
    ALERTS }o--o{ PROCESSES : "spawned by"
    FILE_HASHES ||--o{ QUARANTINED_FILES : "quarantined as"
    ALERT_RULES ||--o{ ALERTS : "matches"
```

### 3. Data Flow Diagram

**Level 0 - Context**

```mermaid
graph LR
    ANALYST(["SOC Analyst"])
    THREAT(["Threat Actor"])
    INTEL(["Threat Intel APIs"])

    subgraph BWE["BinaryWebEngine"]
        CORE["Security Engine\n+ Dashboard"]
    end

    THREAT -->|"Attack requests"| CORE
    ANALYST -->|"Dashboard interactions"| CORE
    CORE -->|"IP reputation queries"| INTEL
    INTEL -->|"Reputation scores"| CORE
    CORE -->|"Alerts and reports"| ANALYST
    CORE -->|"Block decisions"| THREAT
```

**Level 1 - Internal Flow**

```mermaid
graph TD
    subgraph IN["Inputs"]
        HTTP["HTTP Requests"]
        LOGS["System Logs"]
        FS["File System Events"]
        PROCS["Process Table"]
        NETS["Network Connections"]
    end

    subgraph DET["Detection"]
        WAFE["WAF Engine"]
        FIME["File Monitor"]
        PROCE["Process Monitor"]
        NETE["Network Monitor"]
        LOGP["Login Monitor"]
        MLE["ML Anomaly"]
    end

    subgraph CORR["Correlation"]
        KCE["Kill Chain Engine"]
        CORRE["Correlation Engine"]
        INTELE["Intel Enrichment"]
        AIE["Analysis Assistant"]
    end

    subgraph STORE["Persistence"]
        D1[("D1 - Alerts + Events")]
        KVS[("KV - Config + Audit")]
        VDB[("Vectorize - Embeddings")]
    end

    subgraph OUT["Outputs"]
        DASH["Dashboard\n14 tabs"]
        HOOK["SOAR Webhooks"]
        REP["Compliance Reports"]
    end

    HTTP --> WAFE
    LOGS --> LOGP
    FS --> FIME
    PROCS --> PROCE
    NETS --> NETE
    HTTP --> MLE

    WAFE & FIME & PROCE & NETE & LOGP & MLE --> KCE
    KCE --> CORRE
    WAFE --> INTELE
    CORRE --> INTELE
    INTELE --> AIE

    WAFE & FIME & PROCE & NETE & LOGP & KCE & CORRE --> D1
    AIE --> KVS
    KCE --> VDB

    D1 --> DASH
    D1 --> REP
    CORRE --> HOOK
```

### 4. Use Case Diagram

```mermaid
flowchart TD
    subgraph Actors
        A(["SOC Analyst"])
        C(["CISO"])
        E(["Engine Process"])
        T(["Threat Actor"])
    end

    subgraph Dashboard["Dashboard Use Cases"]
        D1["Monitor Security Posture"]
        D2["Investigate Alert + Explain"]
        D3["Track Kill Chain"]
        D4["Manage WAF Rules"]
        D5["Review Login Events"]
        D6["Monitor File Integrity"]
        D7["Generate Report"]
        D8["Chat with Analyst"]
    end

    subgraph Engine["Engine Use Cases"]
        E1["Detect WAF Attack"]
        E2["Detect File Change"]
        E3["Detect Brute Force"]
        E4["Reconstruct Kill Chain"]
        E5["Score ML Anomaly"]
        E6["Block IP at Firewall"]
        E7["Quarantine File"]
    end

    A --> D1 & D2 & D3 & D4 & D5 & D6 & D8
    C --> D7 & D1
    E --> E1 & E2 & E3 & E4 & E5
    T -.->|triggers| E1
    T -.->|triggers| E3

    E1 -->|fires alert| E4
    E2 -->|fires alert| E4
    E3 -->|fires alert| E6
    E4 -->|composite alert| D2
    E5 -->|fires alert| D2
    E1 -.->|may trigger| E6
    E2 -.->|may trigger| E7
    D2 -.->|includes| D8
```

### 5. Sequence Diagram: Core Analyst Interaction Loop

```mermaid
sequenceDiagram
    autonumber
    participant A as SOC Analyst
    participant UI as Dashboard
    participant W as Cloudflare Worker
    participant D1 as D1 Database
    participant GROQ as Groq API
    participant ABUSE as AbuseIPDB

    A->>UI: Open Kill Chain tab
    UI->>W: GET /killchain
    W->>W: checkAuth() validate session
    W->>D1: GROUP BY ip_address COUNT alerts
    D1-->>W: Chain rows
    W-->>UI: JSON chains array 200 OK
    UI->>A: Kill chain cards with MITRE stage badges

    A->>UI: Click alert Explain button
    UI->>W: POST /ai/explain/42
    W->>W: checkAIRateLimit() 10 per minute
    W->>D1: SELECT FROM alerts WHERE id=42
    D1-->>W: Alert record
    W->>W: buildExplainPrompt(alert)
    W->>GROQ: POST chat completions Llama 3 8B
    GROQ-->>W: Explanation text
    W->>D1: INSERT OR REPLACE alert_explanations
    W-->>UI: JSON explanation 200 OK
    UI->>A: Explanation panel with action buttons

    A->>UI: Click Block IP
    UI->>W: POST /traffic/block ip=x.x.x.x
    W->>D1: UPDATE traffic_log SET is_blocked=1
    D1-->>W: 1 row affected
    W->>ABUSE: GET reputation check optional
    ABUSE-->>W: Abuse score and categories
    W-->>UI: success true
    UI->>A: Confirmation toast notification
```

---

## Cognitive UX Architecture

Every design decision is grounded in behavioral psychology research.

**Goal Gradient Effect** - Kill chain cards show `3/7 stages`. Color saturation increases as stage count rises. At 5+ stages the card border pulses red. Analysts prioritize high-stage chains without reading descriptions because the visual acceleration creates an instinctive urgency response.

**Zeigarnik Effect** - Unresolved critical alerts carry a pulsing red dot that persists across tab changes. The nav badge shows only unresolved critical count. The brain's tendency to remember incomplete tasks is weaponized to keep critical incidents visible.

**Labor Illusion** - The Analysis Assistant shows "Analyst is reviewing context..." before delivering its response. This is not fake delay. Ten live database queries run server-side during that window. The animation anchors attention, signals analytical depth, and measurably increases perceived credibility of the output.

**Signal Integrity** - Severity badges use a strict four-level system. Critical is always red. High is always orange. No gradient. No exceptions. The moment severity colors become negotiable, the entire alert triage system loses its anchoring effect on analyst cognition.

---

## Architecture Audit Findings

| Finding | Severity | Status | Context |
|---|---|---|---|
| Sessions in `VALID_SESSIONS` Map (in-memory) | High | By Design | Workers are stateless isolates. Sessions reset on deploy. Production uses D1-persisted sessions or signed JWTs. |
| Password in `worker.js` constants | High | By Design | Demo credential for judge access. Production uses bcrypt-hashed credentials in D1. |
| WAF mutation routes return stub `{success:true}` | Medium | Resolved | Integrated with D1 database storage to persist rule insertions, updates, and deletes. |
| `Access-Control-Allow-Origin: *` | Medium | Intentional | Cross-origin access required for Firebase frontend to workers.dev API in the demo. |
| Six sequential COUNTs in `getStats()` | Low | Acceptable | D1 is edge-local SQLite; each query is sub-millisecond. Production uses a materialized stats view. |
| `timeout` on `fetch()` (not a valid option) | Info | Resolved | Corrected fetch implementation using standard AbortSignal.timeout(30000). |

---

## Engineering Task Force

| Name | Role |
|---|---|
| Kholipha Ahmmad Al-Amin | Principal Systems Architect, Team Lead |
| K4z1 SABBIR | Lead Full-Stack Developer |
| Md Mushfiqur Rahman | Product and Behavioral UX Designer |
| Abu Hurayra | Product and Behavioral UX Designer |
| Khadija Tull Khushbu | Security Domain Expert |

---

## Security Notice

The core BinaryWebEngine engine is closed-source and commercially licensed. This repository contains only the marketing website, demo dashboard, and Cloudflare Worker API backend. The actual Linux engine is distributed as a compiled executable and is not present here.

For responsible disclosure: security@binaryshielders.com

---

<div align="center">

&copy; 2026 BinaryShielders. All rights reserved.

[Live Demo](https://binarywebengine.web.app) &middot; [Documentation](https://binarywebengine.web.app/docs) &middot; [Contact](https://binarywebengine.web.app/contact)

</div>
