# Part 3 — Explanation

## Key Design Decisions

### 1. Sequential stages with independent retry

Each stage runs in order, but retries are isolated per stage. If `configure_dns` fails, we retry it without re-running `assign_hosting`. This minimizes wasted work and avoids side effects from re-executing stages that already succeeded.

### 2. Idempotency through log-based checks

Rather than tracking state with flags that could get out of sync, idempotency is enforced by querying the log table: "has this stage already succeeded for this domain?" This makes the log the single source of truth and means the pipeline is always safe to re-run.

### 3. Structured results, not exceptions

Every stage executor returns a `StageResult` dataclass with `success`, `message`, `error`, and optional `data`. This avoids the ambiguity of try/catch flows where you're never sure if an exception means "retry" or "permanent failure." The pipeline engine always gets a clean signal.

### 4. Silent failure detection as a first-class stage

`verify_live` isn't an afterthought — it's a pipeline stage with its own retry logic. This means the system can't report "all stages passed" unless the site is actually responding. It catches the exact class of bugs the original system suffered from.

### 5. SSE for real-time feedback

The batch endpoint streams Server-Sent Events so the frontend can show progress as domains are processed. This is simpler than WebSocket for a one-directional feed and works well with Next.js's streaming model.

### 6. Next.js + shadcn/ui for the dashboard

The frontend is built with Next.js and shadcn/ui components. The choice gives us:
- A polished, consistent dark-mode UI with minimal effort
- Component patterns (Card, Badge, Button, ScrollArea) that map naturally to pipeline visualization
- Proxy rewrites in `next.config.ts` to avoid CORS issues during development

---

## Tradeoffs

| Decision | Tradeoff |
|----------|----------|
| **SQLite instead of Postgres** | Zero setup for the demo, but no concurrent writes in production |
| **Synchronous stage execution** | Simpler to reason about, but can't process multiple domains in true parallel (the batch endpoint processes them sequentially within a thread) |
| **Simulated failures with `random()`** | Makes the demo unpredictable/interesting, but doesn't test real network conditions |
| **Polling for UI updates** | 1.5s interval is simple and reliable. SSE is used for the batch stream, but the rest of the dashboard polls. In production, I'd use SSE or WebSocket for everything. |
| **No authentication** | This is a demo. A real system would need auth + RBAC. |
| **Retry delays are short (1–4s)** | For demo speed. In production, DNS stages might wait 30–120s between retries. |

---

## What I Would Improve in Production

1. **Queue-based processing** — Replace the synchronous loop with a proper job queue (Celery, Bull, or SQS). Each domain becomes a job, and stages become tasks within that job. This gives you parallelism, persistence, and distributed processing.

2. **Per-stage configuration** — Different stages need different retry counts, timeouts, and backoff curves. DNS propagation needs minutes; hosting assignment needs seconds.

3. **Distributed locking** — Use Redis or a database advisory lock to ensure two workers never process the same domain simultaneously.

4. **Observability stack** — Structured logging (JSON), Prometheus metrics for latency/failure rates per stage, Grafana dashboards, and PagerDuty alerts for sustained failures.

5. **Circuit breaker pattern** — If a hosting provider's API is down, stop sending new requests after N consecutive failures and redirect to a different provider.

6. **Scheduled health checks** — A cron job that re-runs `verify_live` on all "completed" domains daily to catch regressions.

7. **Database migration tool** — Alembic for SQLAlchemy schema changes instead of `create_all`.

8. **Comprehensive test suite** — Unit tests for stage executors, integration tests for the pipeline engine, and E2E tests for the API + frontend.
