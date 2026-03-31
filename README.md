# api-paywall-template

Add a paywall to any API in 5 minutes — powered by [Mainlayer](https://mainlayer.xyz).

Mainlayer is the simplest way to monetize any API endpoint. Add one middleware function and your API starts collecting payments automatically. Supports per-call pricing, subscriptions, and credit packs.

---

## Quickstart

### Step 1 — Get your Mainlayer API key

Sign up at [app.mainlayer.xyz](https://app.mainlayer.xyz) and copy your API key.

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

1. The client calls `POST https://api.mainlayer.xyz/pay` with your `resource_id` to get a payment token.
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
| `X-Payment-Token` | Yes | Token obtained from `POST https://api.mainlayer.xyz/pay` |

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
    unpaidMessage: 'This endpoint requires a paid plan. Visit mainlayer.xyz to get started.',
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

**Python**

```bash
cd python
cp .env.example .env   # fill in your values
pip install -r requirements.txt
uvicorn app:app --reload
# API available at http://localhost:8000
```

**TypeScript**

```bash
cd typescript
cp .env.example .env   # fill in your values
npm install
npm run dev
# API available at http://localhost:3000
```

**Docker**

```bash
# Python version
docker compose up python

# TypeScript version
docker compose up typescript
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

## Support

- Docs: [docs.mainlayer.xyz](https://docs.mainlayer.xyz)
- Issues: open a GitHub issue on this repository
- Community: [mainlayer.xyz/discord](https://mainlayer.xyz/discord)
