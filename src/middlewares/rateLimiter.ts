import { Request, Response, NextFunction } from 'express'
import * as redisService from '../utils/redis.service'
import { logger } from '../config/logger'

interface Bucket {
  count: number
  resetAt: number
}

/**
 * Factory to create rate limiters using Redis (with in-memory fallback).
 * 
 * Uses Redis for distributed rate limiting across multiple instances.
 * Falls back to in-memory storage if Redis is unavailable.
 */
function createRateLimiter(limit: number, windowMs: number) {
  // In-memory fallback (used when Redis is unavailable)
  const buckets = new Map<string, Bucket>()

  return async function rateLimiter(req: Request, res: Response, next: NextFunction) {
    const key = `ratelimit:${req.ip || req.headers['x-forwarded-for']?.toString() || 'unknown'}`
    const now = Date.now()
    const windowSeconds = Math.ceil(windowMs / 1000)

    try {
      // Try Redis first
      const current = await redisService.incr(key)
      
      // Set expiration on first request
      if (current === 1) {
        await redisService.expire(key, windowSeconds)
      }

      // Check if limit exceeded
      if (current > limit) {
        const ttl = await redisService.ttl(key)
        const retryAfter = ttl > 0 ? ttl : Math.ceil(windowSeconds)
        res.setHeader('Retry-After', retryAfter.toString())
        return res.status(429).json({ error: 'Too many requests. Please try again later.' })
      }

      return next()
    } catch (error) {
      // Fallback to in-memory rate limiting
      logger.debug('Redis rate limiting failed, using in-memory fallback', {
        error: (error as Error).message,
      })

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
}

// Specific limiters per endpoint category
export const rateLimitRegister = createRateLimiter(5, 10 * 60 * 1000) // 5 per 10 minutes
export const rateLimitLogin = createRateLimiter(10, 10 * 60 * 1000) // 10 per 10 minutes
export const rateLimitPassword = createRateLimiter(5, 10 * 60 * 1000) // forgot/reset: 5 per 10 minutes
