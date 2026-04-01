from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATABASE_URL = f"sqlite:///{BASE_DIR / 'pipeline.db'}"

MAX_RETRIES = 3
BASE_DELAY_SEC = 1

FAILURE_RATES: dict[str, float] = {
    "assign_hosting": 0.30,
    "configure_dns": 0.40,
    "deploy_site": 0.30,
    "verify_live": 0.20,
}

STAGES = [
    "assign_hosting",
    "configure_dns",
    "deploy_site",
    "verify_live",
]

HOSTING_PROVIDERS = [
    "HostGator",
    "SiteGround",
    "Bluehost",
    "DreamHost",
    "A2Hosting",
]
