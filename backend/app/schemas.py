from pydantic import BaseModel
from datetime import datetime


class DomainRequest(BaseModel):
    domain: str


class BatchRequest(BaseModel):
    domains: list[str]


class DomainPipelineOut(BaseModel):
    id: int
    domain: str
    current_stage: str
    stage_status: str
    hosting_provider: str | None
    retry_count: int
    last_error: str | None
    last_attempted_at: datetime | None
    completed_at: datetime | None
    created_at: datetime | None

    class Config:
        from_attributes = True


class PipelineLogOut(BaseModel):
    id: int
    domain: str
    stage: str
    status: str
    message: str | None
    attempt: int | None
    duration_ms: float | None
    created_at: datetime | None

    class Config:
        from_attributes = True


class SummaryOut(BaseModel):
    total: int
    completed: int
    failed: int
    running: int
    pending: int


class PipelineResultOut(BaseModel):
    domain: str
    status: str
    failed_at: str | None = None
    message: str
