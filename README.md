# Domain Deployment Pipeline

A full-stack simulation of a multi-stage domain deployment pipeline with retry logic, idempotency, silent failure detection, and a real-time dashboard.

**Stack:** Python (FastAPI) + Next.js (React + shadcn/ui) + SQLite

---

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+
- npm or yarn

### 1. Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate    # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

The API is now running at `http://localhost:8000`. Docs at `http://localhost:8000/docs`.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`. The frontend proxies `/api/*` to the backend.

---

## How It Works

The pipeline processes each domain through four sequential stages:

| # | Stage | What It Does |
|---|-------|-------------|
| 1 | **Assign Hosting** | Pick a hosting provider from a pool |
| 2 | **Configure DNS** | Point NS records to the provider |
| 3 | **Deploy Site** | Rebuild the site from an archive snapshot |
| 4 | **Verify Live** | HTTP health check — catches silent failures |

Each stage can fail (simulated). Failures are retried with **exponential backoff + jitter** (up to 3 attempts). Already-completed stages are **skipped on retry** (idempotent).

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/domains` | List all domains and their pipeline state |
| `GET` | `/api/domains/{domain}` | Get a single domain's state |
| `GET` | `/api/logs` | All pipeline logs (optionally filter by `?domain=`) |
| `GET` | `/api/summary` | Aggregate stats (total, completed, failed, running, pending) |
| `POST` | `/api/run` | Run pipeline for a single domain |
| `POST` | `/api/run-batch` | Run pipeline for multiple domains (SSE stream) |
| `POST` | `/api/retry/{domain}` | Retry a failed domain (skips completed stages) |
| `POST` | `/api/reset` | Clear all data for a fresh demo |

---

## Project Structure

```
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI app + CORS
│   │   ├── config.py         # Constants (stages, failure rates, retry config)
│   │   ├── database.py       # SQLAlchemy engine + session
│   │   ├── models.py         # DomainPipeline + PipelineLog tables
│   │   ├── schemas.py        # Pydantic request/response models
│   │   ├── stages.py         # Stage executors (simulated API calls)
│   │   ├── pipeline.py       # Core engine: retry, idempotency, logging
│   │   └── routes.py         # API endpoints
│   └── requirements.txt
├── frontend/
│   ├── app/
│   │   ├── layout.tsx        # Root layout (dark mode)
│   │   ├── page.tsx          # Dashboard page
│   │   └── globals.css       # Tailwind + shadcn CSS variables
│   ├── components/
│   │   ├── ui/               # shadcn/ui primitives (Button, Card, Badge, etc.)
│   │   ├── summary-cards.tsx  # Stats overview
│   │   ├── pipeline-controls.tsx  # Run / Reset controls
│   │   ├── domain-card.tsx    # Per-domain card with stage indicator
│   │   ├── stage-indicator.tsx    # Visual pipeline progress
│   │   ├── log-viewer.tsx     # Filterable log table
│   │   └── event-feed.tsx     # Real-time SSE feed
│   ├── hooks/
│   │   └── use-pipeline.ts   # API calls + SSE streaming
│   └── types/
│       └── index.ts          # Shared TypeScript types
├── docs/
│   ├── SYSTEM_DESIGN.md      # Part 1 — System design writeup
│   └── EXPLANATION.md        # Part 3 — Design decisions & tradeoffs
├── example.php               # Original PHP reference implementation
└── README.md
```

---

## Deliverables

| Part | File | Description |
|------|------|-------------|
| **Part 1** | [`docs/SYSTEM_DESIGN.md`](docs/SYSTEM_DESIGN.md) | System design: tracking, failures, retry, idempotency, silent failure detection |
| **Part 2** | `backend/` + `frontend/` | Working simulation with Python API + React dashboard |
| **Part 3** | [`docs/EXPLANATION.md`](docs/EXPLANATION.md) | Design decisions, tradeoffs, production improvements |
