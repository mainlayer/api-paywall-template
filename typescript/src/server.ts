import 'dotenv/config'
import express, { Request, Response } from 'express'
import { requirePayment, EntitlementPayload } from './middleware'

const app = express()
app.use(express.json())

const PORT = Number(process.env.PORT ?? 3000)
const RESOURCE_ID = process.env.RESOURCE_ID
const MAINLAYER_BASE_URL = process.env.MAINLAYER_BASE_URL ?? 'https://api.mainlayer.fr'

if (!RESOURCE_ID) {
  console.error('[Mainlayer] RESOURCE_ID is not set. Run `npm run setup` first.')
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Free / public routes
// ---------------------------------------------------------------------------

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.get('/', (_req, res) => {
  res.json({
    name: 'Mainlayer Paywall Template',
    version: '1.0.0',
    docs: '/docs',
    paid_routes: ['/api/data', '/api/premium'],
    resource_id: RESOURCE_ID,
    pay_endpoint: `${MAINLAYER_BASE_URL}/pay`,
  })
})

app.get('/docs', (_req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Mainlayer Paywall Template — Docs</title>
      <style>
        body { font-family: sans-serif; margin: 2em; max-width: 800px; }
        code { background: #f0f0f0; padding: 0.2em 0.4em; border-radius: 3px; }
        pre { background: #f0f0f0; padding: 1em; border-radius: 5px; overflow-x: auto; }
        h2 { color: #333; border-bottom: 2px solid #333; padding-bottom: 0.5em; }
        .endpoint { background: #f9f9f9; padding: 1em; margin: 1em 0; border-left: 4px solid #007bff; }
      </style>
    </head>
    <body>
      <h1>Mainlayer Paywall Template</h1>
      <p>Drop-in paywall for any API — powered by <a href="https://mainlayer.fr">Mainlayer</a>.</p>

      <h2>Quick start</h2>
      <ol>
        <li>Sign up at <a href="https://app.mainlayer.fr">app.mainlayer.fr</a></li>
        <li>Get a payment token by calling <code>POST /pay</code> with your resource_id</li>
        <li>Include the token in the <code>X-Payment-Token</code> header on API calls</li>
      </ol>

      <h2>API Endpoints</h2>

      <div class="endpoint">
        <h3>POST /pay</h3>
        <p><strong>Description:</strong> Get a payment token from Mainlayer</p>
        <p><strong>URL:</strong> <code>https://api.mainlayer.fr/pay</code></p>
        <p><strong>Body:</strong></p>
        <pre>{ "resource_id": "${RESOURCE_ID}" }</pre>
        <p><strong>Returns:</strong> <code>{ "payment_token": "..." }</code></p>
      </div>

      <div class="endpoint">
        <h3>GET /api/data</h3>
        <p><strong>Description:</strong> Example paid endpoint</p>
        <p><strong>Headers:</strong> <code>X-Payment-Token: &lt;token&gt;</code> (required)</p>
        <p><strong>Returns:</strong> <code>{ "data": "your valuable data here" }</code></p>
      </div>

      <div class="endpoint">
        <h3>GET /api/premium</h3>
        <p><strong>Description:</strong> Another example paid endpoint</p>
        <p><strong>Headers:</strong> <code>X-Payment-Token: &lt;token&gt;</code> (required)</p>
        <p><strong>Returns:</strong> <code>{ "premium": true, "content": "exclusive content" }</code></p>
      </div>

      <h2>Error Responses</h2>
      <table style="border-collapse: collapse; width: 100%;">
        <tr style="border-bottom: 1px solid #ddd;">
          <th style="text-align: left; padding: 0.5em;">Status</th>
          <th style="text-align: left; padding: 0.5em;">Error Code</th>
          <th style="text-align: left; padding: 0.5em;">Meaning</th>
        </tr>
        <tr style="border-bottom: 1px solid #ddd;">
          <td style="padding: 0.5em;">402</td>
          <td style="padding: 0.5em;"><code>payment_required</code></td>
          <td style="padding: 0.5em;">No token in request</td>
        </tr>
        <tr style="border-bottom: 1px solid #ddd;">
          <td style="padding: 0.5em;">402</td>
          <td style="padding: 0.5em;"><code>payment_invalid</code></td>
          <td style="padding: 0.5em;">Token rejected by Mainlayer</td>
        </tr>
        <tr>
          <td style="padding: 0.5em;">503</td>
          <td style="padding: 0.5em;"><code>mainlayer_unreachable</code></td>
          <td style="padding: 0.5em;">Network error calling Mainlayer</td>
        </tr>
      </table>

      <h2>Links</h2>
      <ul>
        <li><a href="https://docs.mainlayer.fr">Documentation</a></li>
        <li><a href="https://app.mainlayer.fr">Dashboard</a></li>
      </ul>
    </body>
    </html>
  `)
})

// ---------------------------------------------------------------------------
// Paid routes — wrap with requirePayment middleware
// ---------------------------------------------------------------------------

app.get(
  '/api/data',
  requirePayment({ resourceId: RESOURCE_ID }),
  (req: Request, res: Response) => {
    const entitlement = (req as Request & { entitlement: EntitlementPayload }).entitlement
    res.json({
      data: 'your valuable data here',
      entitlement: {
        valid: entitlement.valid,
        consumed_at: entitlement.consumed_at,
      },
    })
  },
)

app.get(
  '/api/premium',
  requirePayment({ resourceId: RESOURCE_ID }),
  (req: Request, res: Response) => {
    const entitlement = (req as Request & { entitlement: EntitlementPayload }).entitlement
    res.json({
      premium: true,
      content: 'exclusive content',
      entitlement_valid: entitlement.valid,
    })
  },
)

// ---------------------------------------------------------------------------
// Error handler
// ---------------------------------------------------------------------------

app.use(
  (
    err: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error('[Error]', err.message)
    res.status(500).json({
      error: 'internal_server_error',
      message: 'An unexpected error occurred',
    })
  },
)

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

app.listen(PORT, () => {
  console.log(`[Mainlayer] Server running on http://localhost:${PORT}`)
  console.log(`[Mainlayer] Resource ID: ${RESOURCE_ID}`)
  console.log(`[Mainlayer] Docs: http://localhost:${PORT}/docs`)
})

export default app
