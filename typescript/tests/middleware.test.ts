import { describe, it, expect, beforeEach, vi } from 'vitest'
import { requirePayment, EntitlementPayload } from '../src/middleware'
import { Request, Response, NextFunction } from 'express'

describe('requirePayment middleware', () => {
  let req: Partial<Request>
  let res: Partial<Response>
  let next: NextFunction

  beforeEach(() => {
    process.env.MAINLAYER_API_KEY = 'test_key'
    process.env.MAINLAYER_ENABLED = 'true'

    req = {
      headers: {},
      ip: '127.0.0.1',
    }
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    }
    next = vi.fn()
  })

  it('should require X-Payment-Token header', async () => {
    const middleware = requirePayment({ resourceId: 'res_123' })
    await middleware(req as Request, res as Response, next)

    expect(res.status).toHaveBeenCalledWith(402)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'payment_required',
      }),
    )
    expect(next).not.toHaveBeenCalled()
  })

  it('should skip verification when MAINLAYER_ENABLED=false', async () => {
    process.env.MAINLAYER_ENABLED = 'false'
    req.headers = { 'x-payment-token': 'token_123' }

    const middleware = requirePayment({ resourceId: 'res_123' })
    await middleware(req as Request, res as Response, next)

    expect(next).toHaveBeenCalled()
    expect(res.status).not.toHaveBeenCalled()
  })

  it('should throw if MAINLAYER_API_KEY not set', () => {
    delete process.env.MAINLAYER_API_KEY

    expect(() => {
      requirePayment({ resourceId: 'res_123' })
    }).toThrow('MAINLAYER_API_KEY')
  })

  it('should use custom apiKey if provided', async () => {
    const middleware = requirePayment({
      resourceId: 'res_123',
      apiKey: 'custom_key',
    })

    // Should not throw even though process.env.MAINLAYER_API_KEY is not used
    expect(middleware).toBeDefined()
  })

  it('should handle Mainlayer connection timeout', async () => {
    req.headers = { 'x-payment-token': 'token_123' }

    // Mock fetch to timeout
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('Timeout')))

    const middleware = requirePayment({ resourceId: 'res_123' })
    await middleware(req as Request, res as Response, next)

    expect(res.status).toHaveBeenCalledWith(503)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'mainlayer_unreachable',
      }),
    )
  })
})
