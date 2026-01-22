import { STSClient, AssumeRoleCommand, Credentials } from '@aws-sdk/client-sts'
import { logger } from '../../config/logger'
import { AppError } from '../../middlewares/error.middleware'

/**
 * IAM Role Assumption Service
 * 
 * Production-ready service for assuming AWS IAM roles for SP-API authentication.
 * 
 * Responsibilities:
 * - Assume configured IAM role
 * - Generate temporary AWS credentials
 * - Handle credential expiration
 * - Cache credentials to minimize STS calls
 * 
 * Architecture:
 * - This service is reusable by ANY SP-API module
 * - Can be extracted to a separate microservice in the future
 * - No route handling, no business logic
 * 
 * Security:
 * - Never logs AWS credentials
 * - Never exposes credentials to frontend
 * - Uses temporary credentials with expiration
 */

export interface IAMCredentials {
  accessKeyId: string
  secretAccessKey: string
  sessionToken: string
  expiration: Date
}

interface CachedCredentials {
  credentials: IAMCredentials
  expiresAt: number // Unix timestamp in milliseconds
}

/**
 * IAM credentials cache using Redis (with in-memory fallback)
 * Key: `iam:${roleArn}`
 * 
 * Uses Redis for distributed caching across multiple instances.
 * Falls back to in-memory storage if Redis is unavailable.
 */
import * as redisService from '../../utils/redis.service'

/**
 * Assume IAM role for SP-API access
 * 
 * This function assumes the configured IAM role and returns temporary AWS credentials
 * that can be used to sign SP-API requests.
 * 
 * @param roleArn - AWS IAM Role ARN (e.g., arn:aws:iam::123456789012:role/SP-API-Role)
 * @param region - AWS region (defaults to us-east-1)
 * @param forceRefresh - Force refresh even if cached credentials are still valid
 * @returns Temporary AWS credentials with expiration
 * 
 * @throws AppError if role assumption fails
 */
export async function assumeRole(
  roleArn: string,
  region: string = 'us-east-1',
  forceRefresh: boolean = false
): Promise<IAMCredentials> {
  if (!roleArn) {
    throw new AppError('IAM Role ARN is required', 400)
  }

  // Validate role ARN format
  if (!roleArn.startsWith('arn:aws:iam::')) {
    throw new AppError('Invalid IAM Role ARN format', 400)
  }

  // Check cache if not forcing refresh
  const cacheKey = `iam:${roleArn}`
  if (!forceRefresh) {
    const cached = await redisService.get<CachedCredentials>(cacheKey)
    if (cached && cached.expiresAt > Date.now() + 60000) {
      // Return cached credentials if they expire more than 1 minute from now
      logger.debug('Using cached IAM credentials', {
        roleArn: roleArn.substring(0, 50) + '...',
        expiresIn: Math.floor((cached.expiresAt - Date.now()) / 1000),
      })
      return cached.credentials
    }
  }

  try {
    // Create STS client
    // Note: STS client uses default AWS credentials from environment or IAM instance profile
    // In production, ensure your application has permissions to assume the role
    const stsClient = new STSClient({
      region,
    })

    logger.info('Assuming IAM role for SP-API', {
      roleArn: roleArn.substring(0, 50) + '...',
      region,
    })

    // Assume role command
    const command = new AssumeRoleCommand({
      RoleArn: roleArn,
      RoleSessionName: `sp-api-session-${Date.now()}`, // Unique session name
      DurationSeconds: 3600, // 1 hour (max for most roles)
    })

    const response = await stsClient.send(command)

    if (!response.Credentials) {
      throw new AppError('No credentials returned from IAM role assumption', 500)
    }

    const awsCredentials = response.Credentials

    const credentials: IAMCredentials = {
      accessKeyId: awsCredentials.AccessKeyId || '',
      secretAccessKey: awsCredentials.SecretAccessKey || '',
      sessionToken: awsCredentials.SessionToken || '',
      expiration: awsCredentials.Expiration || new Date(),
    }

    // Validate credentials
    if (!credentials.accessKeyId || !credentials.secretAccessKey || !credentials.sessionToken) {
      throw new AppError('Incomplete credentials returned from IAM role assumption', 500)
    }

    // Cache credentials in Redis (with in-memory fallback)
    // Expire 1 minute before actual expiration for safety
    const expiresAt = credentials.expiration.getTime() - 60000
    const ttlSeconds = Math.floor((expiresAt - Date.now()) / 1000)
    
    await redisService.set(
      cacheKey,
      {
        credentials,
        expiresAt,
      },
      ttlSeconds > 0 ? ttlSeconds : 3600 // Use calculated TTL or fallback to 1 hour
    )

    logger.info('Successfully assumed IAM role', {
      roleArn: roleArn.substring(0, 50) + '...',
      expiresAt: credentials.expiration.toISOString(),
    })

    return credentials
  } catch (error: any) {
    // Handle AWS SDK errors
    if (error.name === 'AccessDenied') {
      logger.error('Access denied when assuming IAM role', {
        roleArn: roleArn.substring(0, 50) + '...',
        error: error.message,
      })
      throw new AppError('Access denied when assuming IAM role. Check IAM permissions.', 403)
    }

    if (error.name === 'MalformedPolicyDocument') {
      logger.error('Malformed IAM role policy', {
        roleArn: roleArn.substring(0, 50) + '...',
        error: error.message,
      })
      throw new AppError('Invalid IAM role configuration', 400)
    }

    logger.error('Failed to assume IAM role', {
      roleArn: roleArn.substring(0, 50) + '...',
      error: error.message,
      code: error.code,
    })
    throw new AppError('Failed to assume IAM role for SP-API access', 500)
  }
}

/**
 * Clear cached credentials for a specific role
 * 
 * @param roleArn - IAM Role ARN
 */
export async function clearCredentialsCache(roleArn: string): Promise<void> {
  const cacheKey = `iam:${roleArn}`
  await redisService.del(cacheKey)
  logger.debug('Cleared IAM credentials cache', {
    roleArn: roleArn.substring(0, 50) + '...',
  })
}

/**
 * Clear all cached credentials
 * 
 * Note: This only clears credentials with the "iam:" prefix
 */
export async function clearAllCredentialsCache(): Promise<void> {
  // Note: In production, you might want to use SCAN to find all iam keys
  // For now, this is a placeholder - individual credential clearing is preferred
  logger.debug('clearAllCredentialsCache called (use clearCredentialsCache for specific roles)')
}

/**
 * Get cache statistics (for monitoring)
 */
export async function getCredentialsCacheStats(): Promise<{ size: number; keys: string[] }> {
  // Note: Getting all keys is expensive in Redis, so we return a simplified version
  const stats = await redisService.getStats()
  return {
    size: stats.memoryStoreSize, // Approximate
    keys: [], // Don't fetch all keys in production
  }
}
