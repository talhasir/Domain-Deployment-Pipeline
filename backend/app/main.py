import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import engine
from .models import Base
from .routes import router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Domain Deployment Pipeline",
    description="Simulated multi-stage domain deployment pipeline with retry, idempotency, and observability.",
    version="1.0.0",
)

allowed_origins = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:3000,https://domain-deployment-pipeline.vercel.app",
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.get("/health")
def health():
    return {"status": "ok"}
