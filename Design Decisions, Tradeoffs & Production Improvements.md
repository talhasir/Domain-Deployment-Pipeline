# Part 3 — Design Decisions, Tradeoffs & Production Improvements

---

## Key Design Decisions

### 1. State machine over sequential execution

Each domain has a `current_stage` field that acts as a bookmark.
If the system crashes or restarts, the pipeline picks up exactly where it left off
rather than restarting from the beginning. This was the most important design decision —
without it, every crash would require manual cleanup.

### 2. Idempotency before every stage

Before running any stage, the system checks whether that stage already succeeded.
This means the pipeline can be safely retried, restarted, or run multiple times
without creating duplicate hosting accounts, duplicate DNS entries, or re-deploying
sites that are already live.

In production this prevents billing surprises (duplicate hosting accounts) and
prevents DNS conflicts (double-configuring nameservers).

### 3. Separate logs table

The `domain_pipeline` table tracks current state.
The `pipeline_logs` table records every event permanently.

This separation matters: you can always reconstruct exactly what happened to a
domain — every attempt, every failure, every retry — without losing that history
when the main record gets updated.

### 4. Verify live as a dedicated stage

The final stage does not trust what earlier stages reported. It makes a real HTTP
request and checks the response. This is the only reliable way to catch silent
failures — where the hosting API said "success" but the site is actually returning
an error or empty response.

### 5. Exponential backoff with jitter

Retries wait longer after each failure (1s → 2s → 4s in the simulation,
30s → 2min → 10min in production). The jitter (±20% randomness) prevents
multiple domains from retrying simultaneously and overwhelming an already-struggling
provider API.

---

## Tradeoffs Made

| Decision | What I chose | What I gave up |
|---|---|---|
| SQLite for simulation | Zero setup, runs anywhere | Not suitable for production concurrency |
| sleep() for retry delays | Simple, readable | Blocks the process — production should use a job queue |
| Random failure simulation | Easy to demonstrate | Doesn't model real provider behavior accurately |
| Single-process pipeline | Easy to follow and debug | No parallelism — production would process domains concurrently |
| MAX_RETRIES = 3 hardcoded | Simple | Production would configure this per stage (DNS needs more retries than hosting) |

---

## What I Would Improve in a Real Production System

### 1. Replace sleep() with a proper job queue

In production, retrying by sleeping blocks the worker process.
Instead, each stage would push a delayed job to a queue (Laravel Queues, RabbitMQ, SQS).
This means thousands of domains can be processed concurrently without blocking.

```
Stage fails → push job with delay=30s back to queue → worker picks it up later
```

### 2. Per-stage configuration

Different stages need different retry settings:
- `assign_hosting`: 3 retries, short delays (provider APIs respond fast)
- `configure_dns`: 5 retries, longer delays (propagation takes time)
- `verify_live`: 8 retries over 2 hours (DNS TTLs can take time to clear)

### 3. Circuit breaker per provider

Track failure rates per hosting provider in real time.
If a provider fails 5 times in 10 minutes, mark it DEGRADED and stop routing
new domains to it automatically. This prevents cascading failures where
one bad provider takes down hundreds of domains simultaneously.

### 4. Diversity-aware provider selection

In the real system, hosting diversity (different IPs, different providers) is
critical. The provider selection algorithm should track current distribution
and select randomly from providers below a maximum share threshold —
never allowing one provider to host more than X% of active sites.

### 5. Active monitoring for completed domains

A scheduled job should periodically re-verify domains marked as completed.
Sites can go down after they were verified live (hosting provider issues,
expired accounts). Without ongoing checks, completed ≠ still live.

### 6. Alert thresholds

```
Silent failure rate > 2% in 1 hour → page on-call
Provider failure rate > 15% → circuit breaker fires automatically
Pipeline queue depth > 10,000 → processing bottleneck alert
Stage avg duration 2x baseline → something is slowing down
```

---

## Summary

The simulation demonstrates the core principles:
reliable state tracking, idempotent execution, retry with backoff,
and explicit silent failure detection.

The production version of this system would add a proper job queue,
per-provider circuit breakers, diversity-aware routing, and continuous
health monitoring — but the same state machine design would remain
at the core.