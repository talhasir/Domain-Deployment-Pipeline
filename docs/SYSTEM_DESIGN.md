# Part 1 — System Design: Domain Deployment Pipeline

## Overview

The system processes domains through a sequential pipeline of four stages. Each domain moves independently through the pipeline, and the system is designed to be **reliable**, **debuggable**, and **fault-tolerant**.

```
┌─────────────┐    ┌───────────────┐    ┌─────────────┐    ┌─────────────┐
│   Assign    │───▶│  Configure    │───▶│   Deploy     │───▶│   Verify    │
│   Hosting   │    │     DNS       │    │    Site      │    │    Live     │
└─────────────┘    └───────────────┘    └─────────────┘    └─────────────┘
     30% fail           40% fail            30% fail           20% fail
```

---

## How Each Stage Is Tracked

Every domain has a persistent record in `domain_pipeline` with:

| Field              | Purpose                                              |
|--------------------|------------------------------------------------------|
| `current_stage`    | Which stage the domain is at right now                |
| `stage_status`     | Running / success / failed for that stage             |
| `hosting_provider` | Context passed between stages                         |
| `retry_count`      | How many retries have been consumed                   |
| `last_error`       | The most recent error message                         |
| `last_attempted_at`| Timestamp of last execution attempt                   |
| `completed_at`     | When the full pipeline finished (null if not done)    |

Every state transition is also recorded in `pipeline_logs` with:
- **domain** + **stage** + **status** + **message**
- **attempt** number and **duration_ms** per execution
- **created_at** timestamp

This gives a full audit trail. You can reconstruct exactly what happened to any domain at any point in time.

---

## How Failures Are Handled

Failures are treated as **expected events**, not exceptions.

1. **Each stage executor returns a structured result** — `{success, message, error, data}` — never raw exceptions.
2. **On failure**, the error is logged, `retry_count` is incremented, and `last_error` is updated.
3. **If all retries are exhausted**, the domain's `stage_status` is set to `failed` and the pipeline halts.
4. **Failed domains can be retried later** via the `/retry/{domain}` endpoint. Thanks to idempotency, already-completed stages are skipped.

No failure is ever swallowed silently. The log table captures every failed attempt with the exact error and duration.

---

## Retry Strategy

**Exponential backoff with jitter:**

```
delay = BASE_DELAY * 2^(attempt - 1)   →   1s, 2s, 4s
jitter = random(0, delay * 0.2)         →   ±20%
wait = delay + jitter
```

| Attempt | Base Delay | With Jitter    |
|---------|-----------|----------------|
| 1       | 1s        | 1.0–1.2s       |
| 2       | 2s        | 2.0–2.4s       |
| 3       | (final)   | — fail out —   |

**Why this works:**
- Exponential backoff avoids hammering a failing service.
- Jitter prevents thundering-herd when many domains hit the same stage simultaneously.
- 3 retries is a practical default. In production, this would be configurable per stage (DNS propagation might need longer waits than hosting assignment).

---

## How Duplicate Actions Are Prevented (Idempotency)

Before executing any stage, the system checks:

```sql
SELECT COUNT(*) FROM pipeline_logs
WHERE domain = ? AND stage = ? AND status = 'success'
```

If a success record already exists, the stage is **skipped**. This means:

- **Re-running a pipeline is always safe.** It picks up where it left off.
- **If the system crashes mid-pipeline**, restarting it will not re-assign hosting or re-configure DNS for stages that already succeeded.
- **Manual retries** from the dashboard skip completed stages automatically.

---

## How Silent Failures Are Detected

This is the key architectural insight. In the original system, "sometimes the system reports success even when the site is not live."

The `verify_live` stage acts as a **truth check**:

1. It runs **after** all other stages report success.
2. It simulates a real HTTP request to the domain (in production, this would be an actual `HEAD` or `GET` request).
3. If the site responds with a non-200 status or is unreachable, it **fails the pipeline** even though every previous stage said "success."

This catches:
- DNS that was "configured" but hasn't propagated
- Deploys that returned 200 from the deploy API but produced a broken site
- Hosting assignments that went through but the server isn't actually serving

The verify stage has its own retry loop, so transient issues (e.g., DNS propagation lag) get a fair chance before failing.

---

## Production Enhancements

In a real system, I would add:

| Enhancement                   | Why                                                    |
|-------------------------------|--------------------------------------------------------|
| **Dead-letter queue**         | Failed domains after max retries go to a separate queue for human review |
| **Per-stage timeout**         | Kill a stage if it takes > N seconds                   |
| **Webhook / Slack alerts**    | Notify on persistent failures                          |
| **Distributed locking**       | Prevent two workers from processing the same domain    |
| **Scheduled re-verification** | Cron job to re-verify all "live" domains periodically  |
| **Metrics / Prometheus**      | Track failure rates, durations, retry rates per stage  |
| **Circuit breaker**           | If a provider's API fails repeatedly, stop sending new requests temporarily |
