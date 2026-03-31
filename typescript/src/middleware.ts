import { Request, Response, NextFunction, RequestHandler } from 'express'

const MAINLAYER_BASE_URL = 'https://api.mainlayer.fr'

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
 */
export function requirePayment(options: PaywallOptions): RequestHandler {
  const { resourceId, unpaidMessage } = options
  const apiKey = options.apiKey ?? process.env.MAINLAYER_API_KEY

  if (!apiKey) {
    throw new Error(
      '[Mainlayer] MAINLAYER_API_KEY is not set. ' +
        'Set it in your environment or pass apiKey to requirePayment().',
    )
  }

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const paymentToken = req.headers['x-payment-token'] as string | undefined

    if (!paymentToken) {
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
    let verifyRes: Response | globalThis.Response
    try {
      verifyRes = await fetch(`${MAINLAYER_BASE_URL}/entitlements/verify`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          payment_token: paymentToken,
          resource_id: resourceId,
        }),
      })
    } catch (err) {
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
      next()
      return
    }

    if (verifyRes.status === 402) {
      res.status(402).json({
        error: 'payment_invalid',
        message: 'Payment token is invalid or has already been consumed.',
        pay_endpoint: `${MAINLAYER_BASE_URL}/pay`,
      })
      return
    }

    const body = await verifyRes.text()
    res.status(verifyRes.status).json({
      error: 'mainlayer_error',
      message: body,
    })
  }
}
