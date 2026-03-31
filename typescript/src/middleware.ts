import { Request, Response, NextFunction, RequestHandler } from 'express'

const MAINLAYER_BASE_URL = process.env.MAINLAYER_BASE_URL ?? 'https://api.mainlayer.fr'
const REQUEST_TIMEOUT = Number(process.env.MAINLAYER_TIMEOUT_SECONDS ?? 10) * 1000
const MAINLAYER_ENABLED = process.env.MAINLAYER_ENABLED !== 'false'

export interface PaywallOptions {
  /** Mainlayer resource ID for this endpoint or group of endpoints. */
  resourceId: string
  /**
   * Override the API key for this specific middleware instance.
   * Defaults to process.env.MAINLAYER_API_KEY.
   */
  apiKey?: string
  /**
   * Custom message shown to callers who have not paid.
   */
  unpaidMessage?: string
}

export interface EntitlementPayload {
  valid: boolean
  resource_id: string
  consumed_at: string
  metadata?: Record<string, unknown>
}

/**
 * Express middleware factory — wrap any route with a Mainlayer paywall.
 *
 * Usage:
 *   app.get('/api/data', requirePayment({ resourceId: process.env.RESOURCE_ID! }), handler)
 *
 * The client must pass its Mainlayer payment token in the X-Payment-Token header.
 * Obtain a token by calling POST https://api.mainlayer.fr/pay with the resource_id.
 *
 * For local development, set `MAINLAYER_ENABLED=false` to skip payment verification.
 */
export function requirePayment(options: PaywallOptions): RequestHandler {
  const { resourceId, unpaidMessage } = options
  const apiKey = options.apiKey ?? process.env.MAINLAYER_API_KEY

  if (!apiKey && MAINLAYER_ENABLED) {
    throw new Error(
      '[Mainlayer] MAINLAYER_API_KEY is not set. ' +
        'Set it in your environment or pass apiKey to requirePayment(). ' +
        'Or set MAINLAYER_ENABLED=false for local development.',
    )
  }

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Skip verification if disabled (local development)
    if (!MAINLAYER_ENABLED) {
      ;(req as Request & { entitlement: EntitlementPayload }).entitlement = {
        valid: true,
        resource_id: resourceId,
        consumed_at: new Date().toISOString(),
      }
      next()
      return
    }

    const paymentToken = req.headers['x-payment-token'] as string | undefined
    const clientIp = req.ip ?? 'unknown'

    if (!paymentToken) {
      console.warn(`[Mainlayer] Missing payment token from ${clientIp}`)
      res.status(402).json({
        error: 'payment_required',
        message:
          unpaidMessage ??
          'Include your Mainlayer payment token in the X-Payment-Token header.',
        resource_id: resourceId,
        pay_endpoint: `${MAINLAYER_BASE_URL}/pay`,
        docs: 'https://docs.mainlayer.fr/quickstart',
      })
      return
    }

    // Verify the token with Mainlayer
    let verifyRes: globalThis.Response
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)

      try {
        verifyRes = await fetch(`${MAINLAYER_BASE_URL}/entitlements/verify`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'User-Agent': 'mainlayer-paywall-template/1.0',
          },
          body: JSON.stringify({
            payment_token: paymentToken,
            resource_id: resourceId,
          }),
          signal: controller.signal,
        })
      } finally {
        clearTimeout(timeoutId)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      console.error(`[Mainlayer] Connection error: ${msg}`)
      res.status(503).json({
        error: 'mainlayer_unreachable',
        message: 'Could not reach the Mainlayer API. Please try again.',
      })
      return
    }

    if (verifyRes.status === 200) {
      const entitlement = (await verifyRes.json()) as EntitlementPayload
      // Attach entitlement payload so route handlers can access it
      ;(req as Request & { entitlement: EntitlementPayload }).entitlement = entitlement
      console.log(`[Mainlayer] Payment verified for ${resourceId}`)
      next()
      return
    }

    if (verifyRes.status === 402) {
      console.warn(`[Mainlayer] Invalid payment token from ${clientIp}`)
      res.status(402).json({
        error: 'payment_invalid',
        message: 'Payment token is invalid or has already been consumed.',
        pay_endpoint: `${MAINLAYER_BASE_URL}/pay`,
      })
      return
    }

    const body = await verifyRes.text()
    console.error(`[Mainlayer] Unexpected response (${verifyRes.status}): ${body.substring(0, 100)}`)
    res.status(verifyRes.status).json({
      error: 'mainlayer_error',
      message: 'Payment verification failed',
    })
  }
}
