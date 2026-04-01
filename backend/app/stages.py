"""
Stage executors — simulate real API calls for each pipeline step.
Each returns a dict with 'success' (bool) and either 'error' or result data.
In production, these would be real HTTP calls to hosting/DNS/deploy APIs.
"""
import random
import time
from dataclasses import dataclass

from .config import FAILURE_RATES, HOSTING_PROVIDERS


@dataclass
class StageResult:
    success: bool
    message: str = ""
    error: str = ""
    data: dict | None = None


def _should_fail(stage: str) -> bool:
    return random.random() < FAILURE_RATES.get(stage, 0.0)


def execute_assign_hosting(domain: str, **ctx) -> StageResult:
    time.sleep(random.uniform(0.1, 0.4))
    if _should_fail("assign_hosting"):
        return StageResult(
            success=False,
            error=f"Provider API timeout while assigning hosting for {domain}",
        )
    provider = random.choice(HOSTING_PROVIDERS)
    return StageResult(
        success=True,
        message=f"Assigned to {provider}",
        data={"provider": provider},
    )


def execute_configure_dns(domain: str, provider: str = "unknown", **ctx) -> StageResult:
    time.sleep(random.uniform(0.1, 0.3))
    if _should_fail("configure_dns"):
        return StageResult(
            success=False,
            error="DNS configuration rejected by nameserver",
        )
    return StageResult(
        success=True,
        message=f"NS records pointed to {provider} nameservers",
    )


def execute_deploy_site(domain: str, **ctx) -> StageResult:
    time.sleep(random.uniform(0.2, 0.5))
    if _should_fail("deploy_site"):
        return StageResult(
            success=False,
            error="Archive snapshot not found for domain",
        )
    return StageResult(
        success=True,
        message="Site rebuilt from archive snapshot",
    )


def execute_verify_live(domain: str, **ctx) -> StageResult:
    """
    Silent-failure detector: even if all prior stages reported success,
    this does a real HTTP-level check. Catches cases where the deploy
    appeared to work but the site is actually down.
    """
    time.sleep(random.uniform(0.2, 0.4))
    if _should_fail("verify_live"):
        return StageResult(
            success=False,
            error="HTTP check failed — site returned 500 or empty response (silent failure caught)",
        )
    return StageResult(
        success=True,
        message="HTTP 200 confirmed — site is live",
    )


STAGE_EXECUTORS = {
    "assign_hosting": execute_assign_hosting,
    "configure_dns": execute_configure_dns,
    "deploy_site": execute_deploy_site,
    "verify_live": execute_verify_live,
}
