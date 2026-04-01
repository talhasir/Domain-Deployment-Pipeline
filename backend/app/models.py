from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, DateTime, Text, Float, Enum as SAEnum
from sqlalchemy.orm import declarative_base

Base = declarative_base()


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class DomainPipeline(Base):
    __tablename__ = "domain_pipeline"

    id = Column(Integer, primary_key=True, autoincrement=True)
    domain = Column(String, unique=True, nullable=False, index=True)
    current_stage = Column(String, nullable=False, default="pending")
    stage_status = Column(String, nullable=False, default="pending")
    hosting_provider = Column(String, nullable=True)
    retry_count = Column(Integer, default=0)
    last_error = Column(Text, nullable=True)
    last_attempted_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utcnow)


class PipelineLog(Base):
    __tablename__ = "pipeline_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    domain = Column(String, nullable=False, index=True)
    stage = Column(String, nullable=False)
    status = Column(String, nullable=False)
    message = Column(Text, nullable=True)
    attempt = Column(Integer, nullable=True)
    duration_ms = Column(Float, nullable=True)
    created_at = Column(DateTime, default=utcnow)
