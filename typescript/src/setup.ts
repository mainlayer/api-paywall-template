/**
 * One-time setup script — registers your API as a Mainlayer resource
 * and prints the RESOURCE_ID to add to your .env file.
 *
 * Run: npm run setup
 */
import 'dotenv/config'

const MAINLAYER_BASE_URL = 'https://api.mainlayer.fr'

interface ResourceConfig {
  name: string
  description: string
  price_usd: number
  pricing_model: 'per_call' | 'subscription' | 'credits'
}

async function setup(): Promise<void> {
  const apiKey = process.env.MAINLAYER_API_KEY

  if (!apiKey) {
    console.error('[Mainlayer] MAINLAYER_API_KEY is not set in your .env file.')
    console.error('  Get your key at https://app.mainlayer.fr')
    process.exit(1)
  }

  // Default resource config — customise before running
  const config: ResourceConfig = {
    name: process.env.RESOURCE_NAME ?? 'My API',
    description: process.env.RESOURCE_DESCRIPTION ?? 'Access to My API endpoints',
    price_usd: Number(process.env.RESOURCE_PRICE_USD ?? 0.01),
    pricing_model: (process.env.RESOURCE_PRICING_MODEL as ResourceConfig['pricing_model']) ?? 'per_call',
  }

  console.log('[Mainlayer] Creating resource with config:')
  console.log(JSON.stringify(config, null, 2))

  let res: globalThis.Response
  try {
    res = await fetch(`${MAINLAYER_BASE_URL}/resources`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: config.name,
        description: config.description,
        pricing: {
          model: config.pricing_model,
          amount_usd: config.price_usd,
        },
      }),
    })
  } catch (err) {
    console.error('[Mainlayer] Network error — could not reach the Mainlayer API.')
    console.error(err)
    process.exit(1)
  }

  if (!res.ok) {
    const body = await res.text()
    console.error(`[Mainlayer] Setup failed (${res.status}): ${body}`)
    process.exit(1)
  }

  const data = (await res.json()) as { id: string; [key: string]: unknown }

  console.log('\n[Mainlayer] Resource created successfully!')
  console.log(`\nAdd this to your .env file:\n`)
  console.log(`  RESOURCE_ID=${data.id}`)
  console.log('\nFull response:')
  console.log(JSON.stringify(data, null, 2))
}

setup()
