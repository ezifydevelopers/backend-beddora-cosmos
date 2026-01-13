import { Request, Response, NextFunction } from 'express'

interface Bucket {
  count: number
  resetAt: number
}

/**
 * Factory to create lightweight in-memory rate limiters.
 * For production scale, replace with Redis/Upstash.
 */
function createRateLimiter(limit: number, windowMs: number) {
  const buckets = new Map<string, Bucket>()

  return function rateLimiter(req: Request, res: Response, next: NextFunction) {
    const key = req.ip || req.headers['x-forwarded-for']?.toString() || 'unknown'
    const now = Date.now()
    const bucket = buckets.get(key)

    if (!bucket || bucket.resetAt < now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs })
      return next()
    }

    if (bucket.count >= limit) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000)
      res.setHeader('Retry-After', retryAfter.toString())
      return res.status(429).json({ error: 'Too many requests. Please try again later.' })
    }

    bucket.count += 1
    buckets.set(key, bucket)
    return next()
  }
}

// Specific limiters per endpoint category
export const rateLimitRegister = createRateLimiter(5, 10 * 60 * 1000) // 5 per 10 minutes
export const rateLimitLogin = createRateLimiter(10, 10 * 60 * 1000) // 10 per 10 minutes
export const rateLimitPassword = createRateLimiter(5, 10 * 60 * 1000) // forgot/reset: 5 per 10 minutes
