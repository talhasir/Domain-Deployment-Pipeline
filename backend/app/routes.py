import asyncio
import json
import logging
from concurrent.futures import ThreadPoolExecutor

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from .database import get_db, get_db_context
from .models import DomainPipeline, PipelineLog, Base
from .pipeline import process_domain, get_pipeline_summary
from .schemas import (
    DomainRequest,
    BatchRequest,
    DomainPipelineOut,
    PipelineLogOut,
    SummaryOut,
    PipelineResultOut,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api")

executor = ThreadPoolExecutor(max_workers=4)


def _run_pipeline_sync(domain: str) -> dict:
    """Run pipeline in a thread-safe way with its own DB session."""
    with get_db_context() as db:
        return process_domain(db, domain)


@router.get("/domains", response_model=list[DomainPipelineOut])
def list_domains(db: Session = Depends(get_db)):
    return db.query(DomainPipeline).order_by(DomainPipeline.created_at.desc()).all()


@router.get("/domains/{domain}", response_model=DomainPipelineOut)
def get_domain(domain: str, db: Session = Depends(get_db)):
    pipeline = db.query(DomainPipeline).filter_by(domain=domain).first()
    if not pipeline:
        raise HTTPException(status_code=404, detail="Domain not found")
    return pipeline


@router.get("/logs", response_model=list[PipelineLogOut])
def list_logs(domain: str | None = None, limit: int = 200, db: Session = Depends(get_db)):
    q = db.query(PipelineLog)
    if domain:
        q = q.filter_by(domain=domain)
    return q.order_by(PipelineLog.created_at.desc()).limit(limit).all()


@router.get("/summary", response_model=SummaryOut)
def summary(db: Session = Depends(get_db)):
    return get_pipeline_summary(db)


@router.post("/run", response_model=PipelineResultOut)
def run_single(req: DomainRequest, db: Session = Depends(get_db)):
    result = process_domain(db, req.domain)
    db.commit()
    return result


@router.post("/run-batch")
async def run_batch(req: BatchRequest):
    """
    Process multiple domains. Returns an SSE stream so the frontend
    can show progress in real time.
    """
    async def event_stream():
        loop = asyncio.get_event_loop()
        for domain in req.domains:
            yield f"data: {json.dumps({'type': 'start', 'domain': domain})}\n\n"
            try:
                result = await loop.run_in_executor(executor, _run_pipeline_sync, domain)
                yield f"data: {json.dumps({'type': 'result', **result})}\n\n"
            except Exception as e:
                logger.exception("Pipeline error for %s", domain)
                yield f"data: {json.dumps({'type': 'error', 'domain': domain, 'message': str(e)})}\n\n"
        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.post("/reset")
def reset_all(db: Session = Depends(get_db)):
    """Wipe all data for a fresh demo run."""
    db.query(PipelineLog).delete()
    db.query(DomainPipeline).delete()
    db.commit()
    return {"message": "All pipeline data cleared"}


@router.post("/retry/{domain}", response_model=PipelineResultOut)
def retry_domain(domain: str, db: Session = Depends(get_db)):
    """Re-run pipeline for a failed domain (idempotent: skips completed stages)."""
    pipeline = db.query(DomainPipeline).filter_by(domain=domain).first()
    if not pipeline:
        raise HTTPException(status_code=404, detail="Domain not found")
    pipeline.stage_status = "pending"
    pipeline.last_error = None
    db.flush()
    result = process_domain(db, domain)
    db.commit()
    return result
