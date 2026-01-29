/**
 * Redis Configuration and Client Setup
 * 
 * Provides Redis client with:
 * - Connection pooling
 * - Graceful fallback if Redis is unavailable
 * - Health check
 * - Error handling
 * 
 * Architecture:
 * - Singleton pattern for client reuse
 * - Optional Redis (app works without it, uses in-memory fallback)
 * - Production-ready with connection retry logic
 */

import Redis, { RedisOptions } from 'ioredis'
import { logger } from './logger'

let redisClient: Redis | null = null
let isRedisAvailable = false
let reconnectAttempts = 0
const MAX_RECONNECT_ATTEMPTS = 5 // Limit reconnection attempts

/**
 * Redis connection options
 */
function getRedisOptions(): RedisOptions {
  const redisUrl = process.env.REDIS_URL
  const redisHost = process.env.REDIS_HOST || 'localhost'
  const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10)
  const redisPassword = process.env.REDIS_PASSWORD
  const redisDb = parseInt(process.env.REDIS_DB || '0', 10)

  // If REDIS_URL is provided, use it (for services like Redis Cloud, Upstash, etc.)
  if (redisUrl) {
    return {
      // ioredis automatically parses REDIS_URL format
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
      retryStrategy: (times: number) => {
        // Stop retrying after max attempts
        if (times > MAX_RECONNECT_ATTEMPTS) {
          logger.warn('Redis max reconnection attempts reached, stopping retries')
          return null // Stop retrying
        }
        const delay = Math.min(times * 50, 2000)
        return delay
      },
      reconnectOnError: (err: Error) => {
        const targetError = 'READONLY'
        if (err.message.includes(targetError)) {
          // Reconnect on READONLY error (Redis cluster failover)
          return true
        }
        return false
      },
      // Disable auto-reconnect after max attempts
      lazyConnect: false,
    }
  }

  // Otherwise, use individual connection parameters
  return {
    host: redisHost,
    port: redisPort,
    password: redisPassword || undefined,
    db: redisDb,
    enableReadyCheck: true,
    maxRetriesPerRequest: 3,
    retryStrategy: (times: number) => {
      // Stop retrying after max attempts
      if (times > MAX_RECONNECT_ATTEMPTS) {
        logger.warn('Redis max reconnection attempts reached, stopping retries')
        return null // Stop retrying
      }
      const delay = Math.min(times * 50, 2000)
      return delay
    },
    reconnectOnError: (err: Error) => {
      const targetError = 'READONLY'
      if (err.message.includes(targetError)) {
        return true
      }
      return false
    },
    // Disable auto-reconnect after max attempts
    lazyConnect: false,
  }
}

/**
 * Initialize Redis client
 * 
 * This function attempts to connect to Redis but doesn't fail if Redis is unavailable.
 * The app will continue to work using in-memory fallbacks.
 */
export async function initializeRedis(): Promise<void> {
  // Skip Redis if REDIS_ENABLED is explicitly set to false
  if (process.env.REDIS_ENABLED === 'false') {
    logger.info('Redis is disabled via REDIS_ENABLED=false, using in-memory fallback')
    return
  }

  try {
    const redisUrl = process.env.REDIS_URL
    const options = getRedisOptions()

    // Create Redis client
    if (redisUrl) {
      redisClient = new Redis(redisUrl, options)
    } else {
      redisClient = new Redis(options)
    }

    // Set up event handlers
    redisClient.on('connect', () => {
      reconnectAttempts = 0 // Reset on successful connect
      logger.info('Redis client connecting...')
    })

    redisClient.on('ready', () => {
      reconnectAttempts = 0 // Reset on ready
      isRedisAvailable = true
      logger.info('Redis client ready and connected')
    })

    redisClient.on('error', (error: Error) => {
      isRedisAvailable = false
      // Only log first few errors to avoid spam
      if (reconnectAttempts < 3) {
        logger.warn('Redis client error (app will use in-memory fallback)', {
          error: error.message,
        })
      }
    })

    redisClient.on('close', () => {
      isRedisAvailable = false
      reconnectAttempts++
      // Only log first few closes to avoid spam
      if (reconnectAttempts <= 3) {
        logger.warn('Redis connection closed (app will use in-memory fallback)')
      }
      // Stop reconnecting after max attempts
      if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        logger.warn('Redis max reconnection attempts reached, disabling Redis')
        if (redisClient) {
          redisClient.disconnect()
          redisClient = null
        }
      }
    })

    redisClient.on('reconnecting', () => {
      reconnectAttempts++
      // Only log first few reconnection attempts
      if (reconnectAttempts <= 3) {
        logger.info('Redis client reconnecting...')
      }
      // Stop reconnecting after max attempts
      if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        logger.warn('Redis max reconnection attempts reached, stopping reconnection attempts')
        if (redisClient) {
          redisClient.disconnect()
          redisClient = null
        }
      }
    })

    // Test connection with timeout
    try {
      await Promise.race([
        redisClient.ping(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Redis connection timeout')), 5000)
        )
      ])
      isRedisAvailable = true
      reconnectAttempts = 0
      logger.info('Redis connection successful')
    } catch (pingError) {
      // If ping fails, disconnect and use fallback
      logger.warn('Redis ping failed, disabling Redis connection', {
        error: (pingError as Error).message,
      })
      if (redisClient) {
        redisClient.disconnect()
        redisClient = null
      }
      isRedisAvailable = false
    }
  } catch (error) {
    isRedisAvailable = false
    logger.warn('Failed to initialize Redis (app will use in-memory fallback)', {
      error: (error as Error).message,
    })
    // Clean up client if it was created
    if (redisClient) {
      redisClient.disconnect()
      redisClient = null
    }
    // Don't throw - app should continue without Redis
  }
}

/**
 * Get Redis client instance
 * 
 * @returns Redis client or null if unavailable
 */
export function getRedisClient(): Redis | null {
  return redisClient
}

/**
 * Check if Redis is available
 * 
 * @returns true if Redis is connected and ready
 */
export function isRedisConnected(): boolean {
  return isRedisAvailable && redisClient?.status === 'ready'
}

/**
 * Close Redis connection gracefully
 */
export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit()
    redisClient = null
    isRedisAvailable = false
    logger.info('Redis connection closed')
  }
}

/**
 * Health check for Redis
 * 
 * @returns true if Redis is healthy
 */
export async function checkRedisHealth(): Promise<boolean> {
  if (!redisClient || !isRedisAvailable) {
    return false
  }

  try {
    await redisClient.ping()
    return true
  } catch (error) {
    logger.warn('Redis health check failed', { error: (error as Error).message })
    return false
  }
}
