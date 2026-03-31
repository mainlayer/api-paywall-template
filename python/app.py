import os
import httpx
from fastapi import FastAPI, Header, HTTPException, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional

app = FastAPI(
    title="Mainlayer Paywall Template",
    description="Drop-in paywall for any API — powered by Mainlayer",
    version="1.0.0",
)

MAINLAYER_API_KEY = os.environ["MAINLAYER_API_KEY"]
MAINLAYER_BASE_URL = "https://api.mainlayer.xyz"
RESOURCE_ID = os.environ["RESOURCE_ID"]  # Your Mainlayer resource ID


# ---------------------------------------------------------------------------
# Payment dependency
# ---------------------------------------------------------------------------

async def check_payment(x_payment_token: Optional[str] = Header(None)):
    """
    FastAPI dependency — verify the caller holds a valid Mainlayer payment token.

    Drop this into any route with:
        dependencies=[Depends(check_payment)]

    The client obtains a payment token by calling POST /pay on the Mainlayer API
    and passing it back in the X-Payment-Token header.
    """
    if not x_payment_token:
        raise HTTPException(
            status_code=402,
            detail={
                "error": "payment_required",
                "message": "Include your Mainlayer payment token in the X-Payment-Token header.",
                "resource_id": RESOURCE_ID,
                "pay_endpoint": f"{MAINLAYER_BASE_URL}/pay",
                "docs": "https://docs.mainlayer.xyz/quickstart",
            },
        )

    # Verify the token against the Mainlayer entitlement API
    async with httpx.AsyncClient(timeout=10.0) as client:
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
            raise HTTPException(
                status_code=503,
                detail={"error": "mainlayer_unreachable", "message": str(exc)},
            )

    if resp.status_code == 200:
        return resp.json()  # entitlement payload — available in route via request.state

    if resp.status_code == 402:
        raise HTTPException(
            status_code=402,
            detail={
                "error": "payment_invalid",
                "message": "Payment token is invalid or has already been consumed.",
                "pay_endpoint": f"{MAINLAYER_BASE_URL}/pay",
            },
        )

    raise HTTPException(
        status_code=resp.status_code,
        detail={"error": "mainlayer_error", "message": resp.text},
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
# One-time setup — create the Mainlayer resource for this API
# ---------------------------------------------------------------------------

class ResourceConfig(BaseModel):
    name: str = "My API"
    description: str = "Access to My API endpoints"
    price_usd: float = 0.01        # Price per call in USD
    pricing_model: str = "per_call"  # per_call | subscription | credits


@app.post("/setup", summary="One-time Mainlayer resource setup")
async def setup(config: ResourceConfig):
    """
    Run once to register your API as a Mainlayer resource.
    The returned resource_id should be saved to your RESOURCE_ID env var.
    """
    async with httpx.AsyncClient(timeout=15.0) as client:
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
            raise HTTPException(503, detail={"error": str(exc)})

    if resp.status_code not in (200, 201):
        raise HTTPException(
            status_code=resp.status_code,
            detail={"error": "setup_failed", "message": resp.text},
        )

    data = resp.json()
    return {
        "success": True,
        "resource_id": data.get("id"),
        "message": "Save this resource_id as your RESOURCE_ID environment variable.",
        "resource": data,
    }
