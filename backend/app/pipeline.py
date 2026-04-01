"""
Core pipeline engine.
Processes a domain through all stages with retry, idempotency, and logging.
"""
import logging
import random
import time
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from .config import STAGES, MAX_RETRIES, BASE_DELAY_SEC
from .models import DomainPipeline, PipelineLog
from .stages import STAGE_EXECUTORS, StageResult

logger = logging.getLogger(__name__)


def _log_event(
    db: Session,
    domain: str,
    stage: str,
    status: str,
    message: str,
    attempt: int | None = None,
    duration_ms: float | None = None,
) -> PipelineLog:
    entry = PipelineLog(
        domain=domain,
        stage=stage,
        status=status,
        message=message,
        attempt=attempt,
        duration_ms=duration_ms,
    )
    db.add(entry)
    db.flush()
    logger.info("[%s] %s | %s — %s", domain, stage, status, message)
    return entry


def _stage_already_completed(db: Session, domain: str, stage: str) -> bool:
    """Idempotency guard: don't re-run a stage that already succeeded."""
    return (
        db.query(PipelineLog)
        .filter_by(domain=domain, stage=stage, status="success")
        .first()
        is not None
    )


def _run_stage_with_retry(
    db: Session,
    domain: str,
    stage: str,
    context: dict,
) -> bool:
    if _stage_already_completed(db, domain, stage):
        _log_event(db, domain, stage, "skipped", "Already completed — skipping")
        return True

    _log_event(db, domain, stage, "started", "Beginning stage")

    for attempt in range(1, MAX_RETRIES + 1):
        start = time.time()
        executor = STAGE_EXECUTORS[stage]
        result: StageResult = executor(domain, **context)
        elapsed_ms = round((time.time() - start) * 1000, 1)

        if result.success:
            if stage == "assign_hosting" and result.data:
                provider = result.data.get("provider")
                if provider:
                    pipeline = db.query(DomainPipeline).filter_by(domain=domain).first()
                    if pipeline:
                        pipeline.hosting_provider = provider
                    context["provider"] = provider

            _log_event(db, domain, stage, "success", result.message, attempt, elapsed_ms)
            return True

        if attempt < MAX_RETRIES:
            delay = BASE_DELAY_SEC * (2 ** (attempt - 1))
            jitter = random.uniform(0, delay * 0.2)
            wait = delay + jitter
            _log_event(
                db, domain, stage, "retrying",
                f"Attempt {attempt}/{MAX_RETRIES} failed: {result.error}. "
                f"Retrying in {wait:.1f}s",
                attempt, elapsed_ms,
            )
            pipeline = db.query(DomainPipeline).filter_by(domain=domain).first()
            if pipeline:
                pipeline.retry_count += 1
                pipeline.last_error = result.error
            db.flush()
            time.sleep(wait)
        else:
            _log_event(
                db, domain, stage, "failed",
                f"All {MAX_RETRIES} attempts failed. Last error: {result.error}",
                attempt, elapsed_ms,
            )

    return False


def process_domain(db: Session, domain: str) -> dict:
    """
    Run the full pipeline for a single domain.
    Returns a summary dict with final status.
    """
    pipeline = db.query(DomainPipeline).filter_by(domain=domain).first()
    if not pipeline:
        pipeline = DomainPipeline(domain=domain, current_stage="pending")
        db.add(pipeline)
        db.flush()

    context: dict = {}
    if pipeline.hosting_provider:
        context["provider"] = pipeline.hosting_provider

    for stage in STAGES:
        pipeline.current_stage = stage
        pipeline.stage_status = "running"
        pipeline.last_attempted_at = datetime.now(timezone.utc)
        db.flush()

        success = _run_stage_with_retry(db, domain, stage, context)

        if not success:
            pipeline.stage_status = "failed"
            db.flush()
            return {
                "domain": domain,
                "status": "failed",
                "failed_at": stage,
                "message": f"Pipeline failed at stage: {stage}",
            }

        if pipeline.hosting_provider:
            context["provider"] = pipeline.hosting_provider

        pipeline.stage_status = "success"
        db.flush()

    pipeline.current_stage = "completed"
    pipeline.stage_status = "success"
    pipeline.completed_at = datetime.now(timezone.utc)
    db.flush()

    return {
        "domain": domain,
        "status": "completed",
        "message": f"{domain} is live!",
    }


def get_pipeline_summary(db: Session) -> dict:
    """Aggregate stats for the dashboard."""
    pipelines = db.query(DomainPipeline).all()
    total = len(pipelines)
    completed = sum(1 for p in pipelines if p.current_stage == "completed")
    failed = sum(1 for p in pipelines if p.stage_status == "failed")
    running = sum(1 for p in pipelines if p.stage_status == "running")
    pending = total - completed - failed - running

    return {
        "total": total,
        "completed": completed,
        "failed": failed,
        "running": running,
        "pending": pending,
    }
