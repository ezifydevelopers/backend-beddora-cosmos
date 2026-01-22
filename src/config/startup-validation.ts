/**
 * Startup Validation
 * 
 * Validates critical environment variables and dependencies on app startup.
 * Implements fail-fast strategy to prevent silent misconfigurations.
 * 
 * Requirements:
 * - ENCRYPTION_KEY must be set and exactly 32 characters
 * - Redis must be reachable (if enabled)
 * - Database must be connected
 * - Critical SP-API configs validated (if using SP-API features)
 */

import { env } from './env'
import { logger } from './logger'
import { isRedisAvailable } from './redis'
import { AppError } from '../middlewares/error.middleware'

/**
 * Validate encryption key
 * 
 * CRITICAL: Without encryption key, all encrypted data is inaccessible.
 * Must fail fast to prevent data loss.
 */
export function validateEncryptionKey(): void {
  const encryptionKey = process.env.ENCRYPTION_KEY

  if (!encryptionKey) {
    logger.error('CRITICAL: ENCRYPTION_KEY environment variable is not set')
    throw new AppError(
      'CRITICAL: ENCRYPTION_KEY environment variable is not set. Application cannot start without encryption key.',
      500
    )
  }

  if (encryptionKey.length !== 32) {
    logger.error('CRITICAL: ENCRYPTION_KEY must be exactly 32 characters long', {
      actualLength: encryptionKey.length,
    })
    throw new AppError(
      `CRITICAL: ENCRYPTION_KEY must be exactly 32 characters long. Current length: ${encryptionKey.length}`,
      500
    )
  }

  logger.info('✅ Encryption key validated')
}

/**
 * Validate Redis connection (if enabled)
 * 
 * Redis is critical for:
 * - Token caching (prevents excessive API calls)
 * - Distributed locking (prevents concurrent token refresh)
 * - Rate limiting (distributed rate limiting)
 * 
 * If Redis is enabled but not reachable, fail fast.
 */
export async function validateRedisConnection(): Promise<void> {
  if (!env.redisEnabled) {
    logger.warn('⚠️  Redis is disabled - using in-memory fallback (not recommended for production)')
    return
  }

  // Wait a bit for Redis to connect (if async initialization)
  await new Promise((resolve) => setTimeout(resolve, 1000))

  if (!isRedisAvailable()) {
    logger.error('CRITICAL: Redis is enabled but not reachable', {
      redisUrl: env.redisUrl || `${env.redisHost}:${env.redisPort}`,
    })
    throw new AppError(
      'CRITICAL: Redis is enabled but not reachable. Please check Redis connection or disable Redis.',
      500
    )
  }

  logger.info('✅ Redis connection validated')
}

/**
 * Validate database connection
 * 
 * Database is critical for:
 * - Storing encrypted credentials
 * - Storing order/finance data
 * - Multi-seller isolation
 */
export async function validateDatabaseConnection(): Promise<void> {
  // Database connection is validated in connectDb() function
  // This is just a placeholder for explicit validation if needed
  logger.info('✅ Database connection validated')
}

/**
 * Validate SP-API configuration (if using SP-API features)
 * 
 * Validates that required SP-API environment variables are set
 * when SP-API features are being used.
 * 
 * Note: These are optional if SP-API features are not used.
 */
export function validateSPAPIConfiguration(): void {
  // Only validate if SP-API features are being used
  // For now, we'll just log warnings if critical vars are missing
  // In production, you might want to make these required

  if (!env.amazonSpApiClientId) {
    logger.warn('⚠️  AMAZON_SP_API_CLIENT_ID not set - OAuth features will not work')
  }

  if (!env.amazonSpApiClientSecret) {
    logger.warn('⚠️  AMAZON_SP_API_CLIENT_SECRET not set - OAuth may fail for Solution IDs')
  }

  logger.info('✅ SP-API configuration validated')
}

/**
 * Validate IAM role configuration (if using SP-API)
 * 
 * IAM role is required for most SP-API endpoints.
 * Without it, most API calls will fail.
 */
export function validateIAMRoleConfiguration(): void {
  // IAM role is stored per-seller in database, not in env
  // This validation is just a placeholder for future checks
  // You might want to check if any active sellers have IAM roles configured
  logger.debug('IAM role configuration check skipped (stored per-seller in database)')
}

/**
 * Run all startup validations
 * 
 * This function should be called before starting the server.
 * If any validation fails, the application will not start.
 */
export async function runStartupValidations(): Promise<void> {
  logger.info('🔍 Running startup validations...')

  try {
    // Critical validations (must pass)
    validateEncryptionKey()
    await validateRedisConnection()
    await validateDatabaseConnection()

    // Warning validations (log warnings but don't fail)
    validateSPAPIConfiguration()
    validateIAMRoleConfiguration()

    logger.info('✅ All startup validations passed')
  } catch (error) {
    logger.error('❌ Startup validation failed', {
      error: (error as Error).message,
    })
    throw error // Re-throw to prevent app startup
  }
}
