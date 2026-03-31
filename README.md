# api-paywall-template

Add a paywall to any API in 5 minutes — powered by [Mainlayer](https://mainlayer.fr).

Mainlayer is the simplest way to monetize any API endpoint. Add one middleware function and your API starts collecting payments automatically. Supports per-call pricing, subscriptions, and credit packs.

**This template includes:**
- Drop-in payment middleware for Express and FastAPI
- Per-call, subscription, and credit-based billing models
- Local development mode (skip payment checks)
- Comprehensive error handling and logging
- Full test coverage
- Production-ready code

---

## 5-Minute Quickstart

### Step 1 — Get your Mainlayer API key

Sign up at [app.mainlayer.fr](https://app.mainlayer.fr) and copy your API key.

### Step 2 — Run the interactive setup

```bash
chmod +x scripts/setup.sh
./scripts/setup.sh
```

The script will:
1. Prompt for your API key and pricing details
2. Register your API as a Mainlayer resource
3. Write `MAINLAYER_API_KEY` and `RESOURCE_ID` to your `.env` file

### Step 3 — Wrap your endpoint

Pick your language and add one line:

**Python (FastAPI)**

```python
from fastapi import Depends
from app import check_payment  # or copy the dependency into your project

@app.get("/api/your-endpoint", dependencies=[Depends(check_payment)])
async def your_endpoint():
    return {"data": "paid content"}
```

**TypeScript (Express)**

```typescript
import { requirePayment } from './middleware'

app.get(
  '/api/your-endpoint',
  requirePayment({ resourceId: process.env.RESOURCE_ID! }),
  (req, res) => {
    res.json({ data: 'paid content' })
  },
)
```

That is all. Your endpoint now requires a valid payment token.

---

## How it works

```
Client                         Your API                    Mainlayer
  │                               │                            │
  │── POST /pay ──────────────────┼────────────────────────── │
  │                               │        ◄── payment_token ─│
  │── GET /api/data ──────────────│                            │
  │   X-Payment-Token: <token>    │                            │
  │                               │── POST /entitlements/verify│
  │                               │                            │
  │                               │◄─── { valid: true } ──────│
  │◄── 200 { data: ... } ─────────│                            │
```

1. The client calls `POST https://api.mainlayer.fr/pay` with your `resource_id` to get a payment token.
2. The client includes the token in the `X-Payment-Token` header on every API call.
3. Your middleware verifies the token with Mainlayer before serving the response.
4. Invalid or missing tokens get a `402 Payment Required` response automatically.

---

## Middleware reference

### Python — `check_payment` dependency

```python
async def check_payment(x_payment_token: Optional[str] = Header(None)):
    ...
```

| Header | Required | Description |
|--------|----------|-------------|
| `X-Payment-Token` | Yes | Token obtained from `POST https://api.mainlayer.fr/pay` |

**Environment variables**

| Variable | Required | Description |
|----------|----------|-------------|
| `MAINLAYER_API_KEY` | Yes | Your Mainlayer secret key |
| `RESOURCE_ID` | Yes | Resource ID created during setup |

**Error responses**

| Status | `error` field | Meaning |
|--------|---------------|---------|
| `402` | `payment_required` | No token in request |
| `402` | `payment_invalid` | Token rejected by Mainlayer |
| `503` | `mainlayer_unreachable` | Network error calling Mainlayer |

---

### TypeScript — `requirePayment(options)` middleware

```typescript
requirePayment(options: PaywallOptions): RequestHandler
```

**`PaywallOptions`**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `resourceId` | `string` | Yes | Your Mainlayer resource ID |
| `apiKey` | `string` | No | Override `MAINLAYER_API_KEY` env var |
| `unpaidMessage` | `string` | No | Custom message shown to unpaid callers |

**Example — custom message**

```typescript
app.get(
  '/api/premium',
  requirePayment({
    resourceId: process.env.RESOURCE_ID!,
    unpaidMessage: 'This endpoint requires a paid plan. Visit mainlayer.fr to get started.',
  }),
  handler,
)
```

**Accessing the entitlement payload in your route**

The verified entitlement is attached to `req.entitlement` after the middleware passes:

```typescript
app.get('/api/data', requirePayment({ resourceId: RESOURCE_ID }), (req, res) => {
  const entitlement = (req as any).entitlement
  console.log('Paid by:', entitlement.metadata?.user_id)
  res.json({ data: 'ok' })
})
```

---

## Pricing examples

Configure pricing when you run `./scripts/setup.sh` or `npm run setup`.

| Model | Config | Use case |
|-------|--------|----------|
| Per-call | `per_call`, `$0.01` | Charge per API request |
| Per-call (bulk) | `per_call`, `$0.001` | High-volume, low-price APIs |
| Credits | `credits`, `$5.00` | Pre-purchase credit packs |
| Subscription | `subscription`, `$9.99` | Monthly access |

---

## Running locally

### Python (FastAPI)

```bash
cd python
cp .env.example .env
# Edit .env and add your MAINLAYER_API_KEY and RESOURCE_ID
pip install -r requirements.txt

# Development (with auto-reload)
uvicorn app:app --reload
# API available at http://localhost:8000
```

**Local development without billing:**

```bash
# Skip payment verification for testing
MAINLAYER_ENABLED=false uvicorn app:app --reload
```

### TypeScript (Express)

```bash
cd typescript
cp .env.example .env
# Edit .env and add your MAINLAYER_API_KEY and RESOURCE_ID
npm install

# Development
npm run dev
# API available at http://localhost:3000

# Documentation
open http://localhost:3000/docs
```

**Local development without billing:**

```bash
MAINLAYER_ENABLED=false npm run dev
```

### Docker

```bash
# Python version
docker compose up python

# TypeScript version
docker compose up typescript
```

### Running tests

**Python:**
```bash
cd python
pytest tests/ -v
```

**TypeScript:**
```bash
cd typescript
npm test
```

---

## Project structure

```
api-paywall-template/
├── python/
│   ├── app.py              # FastAPI app with check_payment dependency
│   ├── requirements.txt
│   ├── .env.example
│   └── Dockerfile
├── typescript/
│   ├── src/
│   │   ├── server.ts       # Express server
│   │   ├── middleware.ts   # requirePayment() factory
│   │   └── setup.ts        # One-time resource registration
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env.example
│   └── Dockerfile
├── scripts/
│   └── setup.sh            # Interactive setup
├── docker-compose.yml
└── README.md
```

---

## Deploying to production

The template is stateless — deploy it anywhere that runs Docker or Node/Python:

- **Railway**: `railway up`
- **Render**: connect GitHub repo, set env vars
- **Fly.io**: `fly launch`
- **AWS Lambda / Google Cloud Run**: wrap with the appropriate adapter

Set `MAINLAYER_API_KEY` and `RESOURCE_ID` as environment secrets in your hosting platform.

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MAINLAYER_API_KEY` | Yes | — | Your Mainlayer secret key from [app.mainlayer.fr](https://app.mainlayer.fr) |
| `RESOURCE_ID` | Yes | — | The resource ID created during setup |
| `MAINLAYER_BASE_URL` | No | `https://api.mainlayer.fr` | Override for custom Mainlayer instance |
| `MAINLAYER_TIMEOUT_SECONDS` | No | `10` | Timeout for Mainlayer API calls |
| `MAINLAYER_ENABLED` | No | `true` | Set to `false` for local development (skip payment) |
| `LOG_LEVEL` (Python) | No | `INFO` | Logging level (DEBUG, INFO, WARNING, ERROR) |
| `CORS_ORIGINS` (Python) | No | `*` | Comma-separated list of allowed origins |

---

## Integrating with your API

### Example 1: Protect all routes in a router (Express)

```typescript
import { Router } from 'express'
import { requirePayment } from './middleware'

const router = Router()
const premiumMiddleware = requirePayment({ resourceId: process.env.RESOURCE_ID! })

router.get('/predictions', premiumMiddleware, (req, res) => {
  res.json({ prediction: 'result' })
})

router.post('/batch-process', premiumMiddleware, (req, res) => {
  res.json({ status: 'processing' })
})

export default router
```

### Example 2: Different pricing tiers (FastAPI)

```python
# Create a dependency for premium-tier endpoints
premium = Depends(check_payment)

# Create a dependency for standard-tier endpoints
standard = Depends(check_payment)

@app.post("/api/standard", dependencies=[standard])
async def standard_tier():
    return {"tier": "standard", "data": ...}

@app.post("/api/premium", dependencies=[premium])
async def premium_tier():
    return {"tier": "premium", "data": ...}
```

---

## Testing your integration

### Using cURL (without real payment)

```bash
# Set local development mode
export MAINLAYER_ENABLED=false

# Start your server
npm run dev  # or: uvicorn app:app --reload

# Call a protected endpoint
curl http://localhost:3000/api/data \
  -H "X-Payment-Token: test_token"
# Returns: { "data": "your valuable data here" }
```

### Using Python

```python
import httpx

# Start your server in local development mode
# MAINLAYER_ENABLED=false npm run dev

resp = httpx.get(
    "http://localhost:3000/api/data",
    headers={"X-Payment-Token": "test_token"}
)
print(resp.json())
# Output: { "data": "your valuable data here" }
```

---

## Pricing models

Configure pricing when creating your Mainlayer resource via the `/setup` endpoint:

| Model | Price | Use case | Example |
|-------|-------|----------|---------|
| **Per-call** | $0.001 – $1.00 | Charge per API request | Embeddings, predictions |
| **Per-unit** | $0.0001 – $0.10 | Charge per output unit | Characters (translation), images, pages (OCR) |
| **Credits** | $5.00, $10.00, etc. | Pre-purchase credit packs | Flexible consumption |
| **Subscription** | $9.99/mo, $99/mo, etc. | Monthly access | Unlimited calls up to quota |

---

## Support

- Docs: [docs.mainlayer.fr](https://docs.mainlayer.fr)
- Issues: open a GitHub issue on this repository
- Community: [mainlayer.fr/discord](https://mainlayer.fr/discord)
- Status: [status.mainlayer.fr](https://status.mainlayer.fr)
