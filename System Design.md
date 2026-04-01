# Domain Deployment Pipeline — System Design

## Overview

The pipeline processes each domain through 4 stages:
Assign Hosting → Configure DNS → Deploy Site → Verify Live

The core principle: **each stage is independent, trackable, and recoverable.**
A failure at any stage should only affect that stage — not restart the whole pipeline.

---

## 1. How Each Stage Is Tracked

Every domain gets a single row in a `domain_pipeline` table.
The row is created when the domain enters the pipeline and updated as it moves through stages.

```sql
CREATE TABLE domain_pipeline (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    domain          VARCHAR(255) NOT NULL UNIQUE,
    current_stage   ENUM('pending','assign_hosting','configure_dns','deploy_site','verify_live','completed','failed') DEFAULT 'pending',
    stage_status    ENUM('pending','running','success','failed','retrying') DEFAULT 'pending',
    hosting_provider VARCHAR(100) DEFAULT NULL,
    retry_count     INT DEFAULT 0,
    last_error      TEXT DEFAULT NULL,
    last_attempted_at DATETIME DEFAULT NULL,
    completed_at    DATETIME DEFAULT NULL,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

A separate `pipeline_logs` table stores every state change permanently:

```sql
CREATE TABLE pipeline_logs (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    domain_id   INT NOT NULL,
    stage       VARCHAR(50) NOT NULL,
    status      ENUM('started','success','failed','retrying','skipped') NOT NULL,
    message     TEXT,
    duration_ms INT,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (domain_id) REFERENCES domain_pipeline(id)
);
```

This gives a full audit trail. You can query:
- "How many domains are stuck at configure_dns right now?"
- "Which hosting providers fail most often?"
- "What was the exact error for domain X on attempt 2?"

---

## 2. How Failures Are Handled

**Three failure types, three responses:**

**Type A — Transient failure** (provider API timeout, rate limit):
→ Retry with exponential backoff. These usually resolve themselves.

**Type B — Persistent failure** (wrong credentials, invalid domain format):
→ Mark as failed immediately. Retrying won't help. Alert the team.

**Type C — Silent failure** (system says success, site is actually down):
→ Caught by the verify_live stage, which does a real HTTP check.
→ If verify fails, the domain re-enters the deploy stage — not from the beginning.

The domain never moves to the next stage until the current stage is confirmed successful.
The domain never restarts from stage 1 after a partial failure.

---

## 3. Retry Strategy

```
Attempt 1: immediate
Attempt 2: wait 30 seconds
Attempt 3: wait 2 minutes
Attempt 4: wait 10 minutes
Attempt 5: mark as FAILED, move to manual review queue
```

**Jitter:** Add ±20% randomness to each wait time.
This prevents all retrying domains from hammering a provider at the same second.

**Max retries per stage:** 3 (configurable per stage — DNS propagation may need more).

---

## 4. Preventing Duplicate Actions (Idempotency)

Before executing any stage, the system checks if that stage already succeeded.

```
assign_hosting:
  → Check if hosting_provider is already set for this domain
  → If yes: skip, mark success, advance to next stage
  → If no: proceed with assignment

configure_dns:
  → Query the hosting provider API: does DNS config already exist?
  → If yes: skip
  → If no: configure

deploy_site:
  → Check if site files are already deployed (checksum or version hash)
  → If match: skip
  → If no: deploy
```

This means: if the system crashes mid-pipeline and restarts, it never creates
duplicate hosting accounts, duplicate DNS entries, or re-deploys a working site.

---

## 5. Detecting and Eliminating Silent Failures

**The problem:** External APIs return success (HTTP 200) but the actual action failed.
Example: Hosting provider says "DNS configured" but nameservers never propagated.

**The solution:** Never trust what the API says. Always verify the outcome directly.

After each stage:
- assign_hosting → call provider API and confirm the account exists
- configure_dns → do a live DNS lookup (dig/nslookup) and confirm NS records match
- deploy_site → request the site URL directly, confirm HTTP 200 + expected content
- verify_live → final HTTP check with content validation (not just status code)

If any verification fails, the stage is marked FAILED even if the API returned success.

**Silent failure detection query** (run on schedule):
```sql
SELECT d.domain, d.current_stage
FROM domain_pipeline d
WHERE d.current_stage = 'completed'
  AND d.completed_at < NOW() - INTERVAL 30 MINUTE
  AND d.domain NOT IN (
    SELECT domain FROM live_verification_log
    WHERE checked_at > NOW() - INTERVAL 1 HOUR
    AND http_status = 200
  );
```
This finds domains the system thinks are live but haven't passed a recent real HTTP check.

---

## Architecture Summary

```
[Domain Queue]
      ↓
[Stage Runner]  ←──────────────────────────────────────┐
      ↓                                                 │
[Check: stage already done?] → YES → advance stage      │
      ↓ NO                                              │
[Execute stage]                                         │
      ↓                                                 │
[Verify outcome directly]                               │
      ↓                          ↓                      │
   SUCCESS                    FAILURE                   │
      ↓                          ↓                      │
[Log + advance]         [retry_count < max?]            │
                               ↓ YES                    │
                        [wait + retry] ──────────────────┘
                               ↓ NO
                        [Mark FAILED + alert]
```