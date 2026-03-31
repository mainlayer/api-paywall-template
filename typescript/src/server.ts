import 'dotenv/config'
import express from 'express'
import { requirePayment } from './middleware'

const app = express()
app.use(express.json())

const PORT = Number(process.env.PORT ?? 3000)
const RESOURCE_ID = process.env.RESOURCE_ID!
const MAINLAYER_BASE_URL = 'https://api.mainlayer.xyz'

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
    paid_routes: ['/api/data', '/api/premium'],
    resource_id: RESOURCE_ID,
    pay_endpoint: `${MAINLAYER_BASE_URL}/pay`,
  })
})

// ---------------------------------------------------------------------------
// Paid routes — wrap with requirePayment middleware
// ---------------------------------------------------------------------------

app.get(
  '/api/data',
  requirePayment({ resourceId: RESOURCE_ID }),
  (_req, res) => {
    // Your actual API logic here
    res.json({ data: 'your valuable data here' })
  },
)

app.get(
  '/api/premium',
  requirePayment({ resourceId: RESOURCE_ID }),
  (_req, res) => {
    res.json({ premium: true, content: 'exclusive content' })
  },
)

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

app.listen(PORT, () => {
  console.log(`[Mainlayer] Server running on http://localhost:${PORT}`)
  console.log(`[Mainlayer] Resource ID: ${RESOURCE_ID}`)
})

export default app
