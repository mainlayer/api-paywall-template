import logging
import os
from typing import Optional

import httpx
from fastapi import FastAPI, Header, HTTPException, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

# Setup logging
logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"))
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Mainlayer Paywall Template",
    description="Drop-in paywall for any API — powered by Mainlayer",
    version="1.0.0",
)

# Configuration
MAINLAYER_API_KEY = os.environ.get("MAINLAYER_API_KEY")
MAINLAYER_BASE_URL = os.environ.get("MAINLAYER_BASE_URL", "https://api.mainlayer.fr")
RESOURCE_ID = os.environ.get("RESOURCE_ID")
REQUEST_TIMEOUT = float(os.environ.get("MAINLAYER_TIMEOUT_SECONDS", "10.0"))

# Feature flag for local development
MAINLAYER_ENABLED = os.environ.get("MAINLAYER_ENABLED", "true").lower() != "false"

if not RESOURCE_ID:
    logger.error("[Mainlayer] RESOURCE_ID not set. Run setup endpoint or set env var.")


# ---------------------------------------------------------------------------
# HTTP client (reuse connection)
# ---------------------------------------------------------------------------

_http_client: Optional[httpx.AsyncClient] = None


def _get_client() -> httpx.AsyncClient:
    global _http_client
    if _http_client is None or _http_client.is_closed:
        _http_client = httpx.AsyncClient(
            timeout=REQUEST_TIMEOUT,
            headers={"User-Agent": "mainlayer-paywall-template/1.0"},
        )
    return _http_client


# ---------------------------------------------------------------------------
# Payment dependency
# ---------------------------------------------------------------------------


class EntitlementPayload(BaseModel):
    """Verified entitlement from Mainlayer."""
    valid: bool
    resource_id: str
    consumed_at: str
    metadata: Optional[dict] = None


async def check_payment(
    request: Request,
    x_payment_token: Optional[str] = Header(None)
) -> EntitlementPayload:
    """
    FastAPI dependency — verify the caller holds a valid Mainlayer payment token.

    Drop this into any route with:
        dependencies=[Depends(check_payment)]

    The client obtains a payment token by calling POST /pay on the Mainlayer API
    and passing it back in the X-Payment-Token header.

    Raises:
        HTTPException: 402 if payment not provided or invalid
        HTTPException: 503 if Mainlayer API unreachable
    """
    if not MAINLAYER_ENABLED:
        logger.debug("Mainlayer disabled — skipping payment check")
        return EntitlementPayload(valid=True, resource_id="mock", consumed_at="mock")

    if not x_payment_token:
        logger.warning("Missing X-Payment-Token header from %s", request.client.host)
        raise HTTPException(
            status_code=402,
            detail={
                "error": "payment_required",
                "message": "Include your Mainlayer payment token in the X-Payment-Token header.",
                "resource_id": RESOURCE_ID,
                "pay_endpoint": f"{MAINLAYER_BASE_URL}/pay",
                "docs": "https://docs.mainlayer.fr/quickstart",
            },
        )

    # Verify the token against the Mainlayer entitlement API
    client = _get_client()
    try:
        resp = await client.post(
            f"{MAINLAYER_BASE_URL}/entitlements/verify",
            headers={
                "Authorization": f"Bearer {MAINLAYER_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "payment_token": x_payment_token,
                "resource_id": RESOURCE_ID,
            },
        )
    except httpx.RequestError as exc:
        logger.error("Mainlayer connection error: %s", exc)
        raise HTTPException(
            status_code=503,
            detail={"error": "mainlayer_unreachable", "message": str(exc)},
        )

    if resp.status_code == 200:
        entitlement = EntitlementPayload(**resp.json())
        logger.info("Payment verified for token (resource=%s)", RESOURCE_ID)
        return entitlement

    if resp.status_code == 402:
        logger.warning("Invalid payment token from %s", request.client.host)
        raise HTTPException(
            status_code=402,
            detail={
                "error": "payment_invalid",
                "message": "Payment token is invalid or has already been consumed.",
                "pay_endpoint": f"{MAINLAYER_BASE_URL}/pay",
            },
        )

    logger.error("Unexpected Mainlayer response: status=%d", resp.status_code)
    raise HTTPException(
        status_code=resp.status_code,
        detail={"error": "mainlayer_error", "message": "Payment verification failed"},
    )


# ---------------------------------------------------------------------------
# Your API routes — protected by the paywall
# ---------------------------------------------------------------------------

@app.get(
    "/api/data",
    dependencies=[Depends(check_payment)],
    summary="Example paid endpoint",
)
async def get_data():
    """
    Your actual API endpoint.
    Adding `dependencies=[Depends(check_payment)]` is all it takes to gate
    this route behind a Mainlayer payment.
    """
    return {"data": "your valuable data here"}


@app.get(
    "/api/premium",
    dependencies=[Depends(check_payment)],
    summary="Another paid endpoint",
)
async def get_premium():
    """Any number of routes can share the same dependency."""
    return {"premium": True, "content": "exclusive content"}


# ---------------------------------------------------------------------------
# Free / public routes
# ---------------------------------------------------------------------------

@app.get("/health", include_in_schema=False)
async def health():
    return {"status": "ok"}


@app.get("/", summary="API info (free)")
async def root():
    return {
        "name": "Mainlayer Paywall Template",
        "paid_routes": ["/api/data", "/api/premium"],
        "resource_id": RESOURCE_ID,
        "pay_endpoint": f"{MAINLAYER_BASE_URL}/pay",
    }


# ---------------------------------------------------------------------------
# Shutdown handler
# ---------------------------------------------------------------------------


@app.on_event("shutdown")
async def shutdown():
    """Close HTTP client on shutdown."""
    global _http_client
    if _http_client and not _http_client.is_closed:
        await _http_client.aclose()


# ---------------------------------------------------------------------------
# One-time setup — create the Mainlayer resource for this API
# ---------------------------------------------------------------------------


class ResourceConfig(BaseModel):
    """Configuration for creating a Mainlayer resource."""
    name: str = "My API"
    description: str = "Access to My API endpoints"
    price_usd: float = 0.01  # Price per call in USD
    pricing_model: str = "per_call"  # per_call | subscription | credits


@app.post("/setup", summary="One-time Mainlayer resource setup")
async def setup(config: ResourceConfig):
    """
    Run once to register your API as a Mainlayer resource.

    The returned resource_id should be saved to your RESOURCE_ID env var.

    **Example:**
    ```json
    {
      "name": "My Embeddings API",
      "description": "Premium embeddings with per-call billing",
      "price_usd": 0.001,
      "pricing_model": "per_call"
    }
    ```
    """
    if not MAINLAYER_API_KEY:
        raise HTTPException(
            status_code=500,
            detail={"error": "no_api_key", "message": "MAINLAYER_API_KEY not set"},
        )

    client = _get_client()
    try:
        resp = await client.post(
            f"{MAINLAYER_BASE_URL}/resources",
            headers={
                "Authorization": f"Bearer {MAINLAYER_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "name": config.name,
                "description": config.description,
                "pricing": {
                    "model": config.pricing_model,
                    "amount_usd": config.price_usd,
                },
            },
        )
    except httpx.RequestError as exc:
        logger.error("Setup request failed: %s", exc)
        raise HTTPException(503, detail={"error": "network_error", "message": str(exc)})

    if resp.status_code not in (200, 201):
        body = resp.text[:200]
        logger.error("Setup failed (status=%d): %s", resp.status_code, body)
        raise HTTPException(
            status_code=resp.status_code,
            detail={"error": "setup_failed", "message": "Could not register resource"},
        )

    data = resp.json()
    logger.info("Resource created: id=%s", data.get("id"))
    return {
        "success": True,
        "resource_id": data.get("id"),
        "message": "Save this resource_id as your RESOURCE_ID environment variable.",
        "resource": data,
    }
