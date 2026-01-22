/**
 * Redis Service Wrapper
 * 
 * Provides a unified interface for Redis operations with graceful fallback to in-memory storage.
 * 
 * Features:
 * - Automatic fallback if Redis is unavailable
 * - Type-safe operations
 * - TTL support
 * - Distributed locking
 * - Batch operations
 * 
 * Architecture:
 * - Singleton pattern
 * - Graceful degradation
 * - Production-ready error handling
 */

import { getRedisClient, isRedisConnected } from '../config/redis'
import { logger } from '../config/logger'

/**
 * In-memory fallback storage
 * Used when Redis is unavailable
 */
const memoryStore = new Map<string, { value: string; expiresAt?: number }>()

/**
 * Clean up expired entries from memory store
 */
function cleanupMemoryStore(): void {
  const now = Date.now()
  for (const [key, entry] of memoryStore.entries()) {
    if (entry.expiresAt && entry.expiresAt < now) {
      memoryStore.delete(key)
    }
  }
}

// Clean up expired entries every 5 minutes
setInterval(cleanupMemoryStore, 5 * 60 * 1000)

/**
 * Set a key-value pair in Redis (or memory fallback)
 * 
 * @param key - Cache key
 * @param value - Value to store (will be JSON stringified)
 * @param ttlSeconds - Time to live in seconds (optional)
 */
export async function set(key: string, value: any, ttlSeconds?: number): Promise<void> {
  const stringValue = typeof value === 'string' ? value : JSON.stringify(value)

  if (isRedisConnected()) {
    const client = getRedisClient()
    if (client) {
      try {
        if (ttlSeconds) {
          await client.setex(key, ttlSeconds, stringValue)
        } else {
          await client.set(key, stringValue)
        }
        return
      } catch (error) {
        logger.warn('Redis set failed, using memory fallback', {
          key,
          error: (error as Error).message,
        })
      }
    }
  }

  // Fallback to memory
  const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined
  memoryStore.set(key, { value: stringValue, expiresAt })
}

/**
 * Get a value from Redis (or memory fallback)
 * 
 * @param key - Cache key
 * @returns Parsed value or null if not found
 */
export async function get<T = any>(key: string): Promise<T | null> {
  if (isRedisConnected()) {
    const client = getRedisClient()
    if (client) {
      try {
        const value = await client.get(key)
        if (value === null) {
          return null
        }
        try {
          return JSON.parse(value) as T
        } catch {
          // If parsing fails, return as string
          return value as T
        }
      } catch (error) {
        logger.warn('Redis get failed, using memory fallback', {
          key,
          error: (error as Error).message,
        })
      }
    }
  }

  // Fallback to memory
  const entry = memoryStore.get(key)
  if (!entry) {
    return null
  }

  // Check expiration
  if (entry.expiresAt && entry.expiresAt < Date.now()) {
    memoryStore.delete(key)
    return null
  }

  try {
    return JSON.parse(entry.value) as T
  } catch {
    return entry.value as T
  }
}

/**
 * Delete a key from Redis (or memory fallback)
 * 
 * @param key - Cache key
 */
export async function del(key: string): Promise<void> {
  if (isRedisConnected()) {
    const client = getRedisClient()
    if (client) {
      try {
        await client.del(key)
        return
      } catch (error) {
        logger.warn('Redis del failed, using memory fallback', {
          key,
          error: (error as Error).message,
        })
      }
    }
  }

  // Fallback to memory
  memoryStore.delete(key)
}

/**
 * Delete multiple keys
 * 
 * @param keys - Array of cache keys
 */
export async function delMany(keys: string[]): Promise<void> {
  if (isRedisConnected()) {
    const client = getRedisClient()
    if (client) {
      try {
        if (keys.length > 0) {
          await client.del(...keys)
        }
        return
      } catch (error) {
        logger.warn('Redis delMany failed, using memory fallback', {
          keyCount: keys.length,
          error: (error as Error).message,
        })
      }
    }
  }

  // Fallback to memory
  for (const key of keys) {
    memoryStore.delete(key)
  }
}

/**
 * Check if a key exists
 * 
 * @param key - Cache key
 * @returns true if key exists
 */
export async function exists(key: string): Promise<boolean> {
  if (isRedisConnected()) {
    const client = getRedisClient()
    if (client) {
      try {
        const result = await client.exists(key)
        return result === 1
      } catch (error) {
        logger.warn('Redis exists failed, using memory fallback', {
          key,
          error: (error as Error).message,
        })
      }
    }
  }

  // Fallback to memory
  const entry = memoryStore.get(key)
  if (!entry) {
    return false
  }

  // Check expiration
  if (entry.expiresAt && entry.expiresAt < Date.now()) {
    memoryStore.delete(key)
    return false
  }

  return true
}

/**
 * Set expiration on a key
 * 
 * @param key - Cache key
 * @param ttlSeconds - Time to live in seconds
 */
export async function expire(key: string, ttlSeconds: number): Promise<void> {
  if (isRedisConnected()) {
    const client = getRedisClient()
    if (client) {
      try {
        await client.expire(key, ttlSeconds)
        return
      } catch (error) {
        logger.warn('Redis expire failed, using memory fallback', {
          key,
          error: (error as Error).message,
        })
      }
    }
  }

  // Fallback to memory
  const entry = memoryStore.get(key)
  if (entry) {
    entry.expiresAt = Date.now() + ttlSeconds * 1000
  }
}

/**
 * Get TTL (time to live) of a key
 * 
 * @param key - Cache key
 * @returns TTL in seconds, or -1 if no expiration, or -2 if key doesn't exist
 */
export async function ttl(key: string): Promise<number> {
  if (isRedisConnected()) {
    const client = getRedisClient()
    if (client) {
      try {
        return await client.ttl(key)
      } catch (error) {
        logger.warn('Redis ttl failed, using memory fallback', {
          key,
          error: (error as Error).message,
        })
      }
    }
  }

  // Fallback to memory
  const entry = memoryStore.get(key)
  if (!entry) {
    return -2 // Key doesn't exist
  }

  if (!entry.expiresAt) {
    return -1 // No expiration
  }

  const remaining = Math.floor((entry.expiresAt - Date.now()) / 1000)
  return remaining > 0 ? remaining : -2
}

/**
 * Increment a numeric value
 * 
 * @param key - Cache key
 * @param amount - Amount to increment (default: 1)
 * @returns New value after increment
 */
export async function incr(key: string, amount: number = 1): Promise<number> {
  if (isRedisConnected()) {
    const client = getRedisClient()
    if (client) {
      try {
        if (amount === 1) {
          return await client.incr(key)
        } else {
          return await client.incrby(key, amount)
        }
      } catch (error) {
        logger.warn('Redis incr failed, using memory fallback', {
          key,
          error: (error as Error).message,
        })
      }
    }
  }

  // Fallback to memory
  const entry = memoryStore.get(key)
  const currentValue = entry ? parseInt(entry.value, 10) || 0 : 0
  const newValue = currentValue + amount
  memoryStore.set(key, { value: newValue.toString() })
  return newValue
}

/**
 * Distributed lock implementation
 * 
 * Acquires a lock with expiration. If lock is already held, returns false.
 * 
 * @param lockKey - Lock key
 * @param ttlSeconds - Lock expiration in seconds (default: 10)
 * @param lockValue - Unique value to identify this lock holder (optional)
 * @returns true if lock was acquired, false if already locked
 */
export async function acquireLock(
  lockKey: string,
  ttlSeconds: number = 10,
  lockValue?: string
): Promise<boolean> {
  const value = lockValue || `${Date.now()}-${Math.random()}`

  if (isRedisConnected()) {
    const client = getRedisClient()
    if (client) {
      try {
        // Use SET with NX (only set if not exists) and EX (expiration)
        const result = await client.set(lockKey, value, 'EX', ttlSeconds, 'NX')
        return result === 'OK'
      } catch (error) {
        logger.warn('Redis lock acquisition failed, using memory fallback', {
          lockKey,
          error: (error as Error).message,
        })
      }
    }
  }

  // Fallback to memory (not truly distributed, but works for single instance)
  const entry = memoryStore.get(lockKey)
  if (entry && entry.expiresAt && entry.expiresAt > Date.now()) {
    return false // Lock is held
  }

  memoryStore.set(lockKey, {
    value,
    expiresAt: Date.now() + ttlSeconds * 1000,
  })
  return true
}

/**
 * Release a distributed lock
 * 
 * @param lockKey - Lock key
 * @param lockValue - Lock value (must match to release)
 */
export async function releaseLock(lockKey: string, lockValue?: string): Promise<void> {
  if (isRedisConnected()) {
    const client = getRedisClient()
    if (client) {
      try {
        if (lockValue) {
          // Lua script to ensure we only delete if value matches (prevents deleting someone else's lock)
          const script = `
            if redis.call("get", KEYS[1]) == ARGV[1] then
              return redis.call("del", KEYS[1])
            else
              return 0
            end
          `
          await client.eval(script, 1, lockKey, lockValue)
        } else {
          await client.del(lockKey)
        }
        return
      } catch (error) {
        logger.warn('Redis lock release failed, using memory fallback', {
          lockKey,
          error: (error as Error).message,
        })
      }
    }
  }

  // Fallback to memory
  if (lockValue) {
    const entry = memoryStore.get(lockKey)
    if (entry && entry.value === lockValue) {
      memoryStore.delete(lockKey)
    }
  } else {
    memoryStore.delete(lockKey)
  }
}

/**
 * Get cache statistics
 * 
 * @returns Statistics about cache usage
 */
export async function getStats(): Promise<{
  isRedisConnected: boolean
  memoryStoreSize: number
  redisMemoryUsage?: string
}> {
  const stats: any = {
    isRedisConnected: isRedisConnected(),
    memoryStoreSize: memoryStore.size,
  }

  if (isRedisConnected()) {
    const client = getRedisClient()
    if (client) {
      try {
        const info = await client.info('memory')
        const memoryMatch = info.match(/used_memory_human:(.+)/)
        if (memoryMatch) {
          stats.redisMemoryUsage = memoryMatch[1].trim()
        }
      } catch (error) {
        // Ignore errors in stats
      }
    }
  }

  return stats
}
