import axios, { AxiosError } from 'axios'
import { logger } from '../../config/logger'
import { AppError } from '../../middlewares/error.middleware'

/**
 * Token Management Service
 * 
 * Production-ready service for managing Amazon LWA (Login with Amazon) tokens.
 * 
 * Responsibilities:
 * - Exchange refresh token for access token
 * - Handle token expiration and refresh
 * - Cache tokens to minimize API calls
 * - Pure token lifecycle management (no business logic)
 * 
 * Architecture:
 * - This service is reusable by ANY SP-API module (orders, reports, inventory, etc.)
 * - Can be extracted to a separate microservice in the future
 * - No route handling, no business logic
 * 
 * Security:
 * - Never logs refresh tokens
 * - Never exposes tokens to frontend
 * - Treats refresh token like a password
 */

export interface LWACredentials {
  clientId: string
  clientSecret?: string // Optional - Application IDs may not require it
  refreshToken: string
}

export interface AccessTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  refresh_token?: string // Only present if token was rotated
}

interface CachedToken {
  accessToken: string
  expiresAt: number // Unix timestamp in milliseconds
}

/**
 * Token cache using Redis (with in-memory fallback)
 * Key: `token:${clientId}:${refreshToken.substring(0, 10)}` (first 10 chars for identification)
 * 
 * Uses Redis for distributed caching across multiple instances.
 * Falls back to in-memory storage if Redis is unavailable.
 */
import * as redisService from '../../utils/redis.service'

/**
 * LWA Token Endpoints by Region
 */
const LWA_ENDPOINTS: Record<string, string> = {
  'us-east-1': 'https://api.amazon.com/auth/o2/token',
  'eu-west-1': 'https://api.amazon.com/auth/o2/token',
  'us-west-2': 'https://api.amazon.com/auth/o2/token',
  // All regions use the same endpoint, but kept for future flexibility
}

/**
 * Get LWA token endpoint URL
 */
function getLWAEndpoint(region: string): string {
  return LWA_ENDPOINTS[region] || LWA_ENDPOINTS['us-east-1']
}

/**
 * Exchange refresh token for access token
 * 
 * This is the core function that performs the LWA token exchange.
 * 
 * @param credentials - LWA credentials (clientId, clientSecret, refreshToken)
 * @param region - AWS region (defaults to us-east-1)
 * @param forceRefresh - Force refresh even if cached token is still valid
 * @returns Access token response with expiration
 * 
 * @throws AppError if token exchange fails
 */
export async function getAccessToken(
  credentials: LWACredentials,
  region: string = 'us-east-1',
  forceRefresh: boolean = false
): Promise<AccessTokenResponse> {
  const { clientId, clientSecret, refreshToken } = credentials

  // Validate inputs
  // Note: clientSecret is optional for some seller account types
  // If not provided, we'll attempt token exchange without it
  if (!clientId || !refreshToken) {
    throw new AppError('Missing required LWA credentials: clientId and refreshToken are required', 400)
  }

  // Create cache key (using first 10 chars of refresh token for identification)
  const cacheKey = `token:${clientId}:${refreshToken.substring(0, 10)}`
  const lockKey = `lock:${cacheKey}`

  // Check cache if not forcing refresh
  if (!forceRefresh) {
    const cached = await redisService.get<CachedToken>(cacheKey)
    if (cached && cached.expiresAt > Date.now() + 60000) {
      // Return cached token if it expires more than 1 minute from now
      logger.debug('Using cached access token', {
        clientId: clientId.substring(0, 20) + '...',
        expiresIn: Math.floor((cached.expiresAt - Date.now()) / 1000),
      })
      return {
        access_token: cached.accessToken,
        token_type: 'Bearer',
        expires_in: Math.floor((cached.expiresAt - Date.now()) / 1000),
      }
    }
  }

  // Use distributed lock to prevent concurrent token refresh
  // This is critical in multi-instance deployments to avoid rate limiting
  const lockKey = `lock:${cacheKey}`
  const lockValue = `${Date.now()}-${Math.random()}`
  const lockAcquired = await redisService.acquireLock(lockKey, 30, lockValue) // 30 second lock

  try {
    // Check cache again after acquiring lock (another instance might have refreshed it)
    if (!forceRefresh && lockAcquired) {
      const cached = await redisService.get<CachedToken>(cacheKey)
      if (cached && cached.expiresAt > Date.now() + 60000) {
        logger.debug('Token refreshed by another instance, using cached token', {
          clientId: clientId.substring(0, 20) + '...',
        })
        return {
          access_token: cached.accessToken,
          token_type: 'Bearer',
          expires_in: Math.floor((cached.expiresAt - Date.now()) / 1000),
        }
      }
    }

    // If lock not acquired, wait a bit and check cache (another instance is refreshing)
    if (!lockAcquired) {
      logger.debug('Token refresh in progress by another instance, waiting...', {
        clientId: clientId.substring(0, 20) + '...',
      })
      // Wait up to 5 seconds for the other instance to finish
      for (let i = 0; i < 10; i++) {
        await new Promise((resolve) => setTimeout(resolve, 500))
        const cached = await redisService.get<CachedToken>(cacheKey)
        if (cached && cached.expiresAt > Date.now() + 60000) {
          logger.debug('Token refreshed by another instance, using cached token', {
            clientId: clientId.substring(0, 20) + '...',
          })
          return {
            access_token: cached.accessToken,
            token_type: 'Bearer',
            expires_in: Math.floor((cached.expiresAt - Date.now()) / 1000),
          }
        }
      }
      // If still no token after waiting, proceed with refresh (lock might have expired)
      logger.warn('Lock not acquired and no token after waiting, proceeding with refresh', {
        clientId: clientId.substring(0, 20) + '...',
      })
    }

    // Exchange refresh token for access token
    const endpoint = getLWAEndpoint(region)
    
    // Log what we're sending (without sensitive data)
    const willSendClientSecret = !!(clientSecret && clientSecret.trim() !== '')
    logger.info('Exchanging refresh token for access token', {
      clientId: clientId.substring(0, 20) + '...',
      endpoint,
      willSendClientSecret,
      // Never log refresh token or client secret
    })

    // Build request params
    // Note: client_secret is optional for seller accounts
    // Seller accounts typically only need: client_id and refresh_token
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
    })

    // Only add client_secret if explicitly provided and not empty
    // Seller accounts typically don't need it - only add if explicitly set
    if (willSendClientSecret) {
      logger.debug('Including client_secret in token exchange request')
      params.append('client_secret', clientSecret)
    } else {
      logger.debug('Token exchange without client_secret (seller account mode)')
    }

    const response = await axios.post<AccessTokenResponse>(
      endpoint,
      params,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: 10000, // 10 seconds
      }
    )

    const { access_token, token_type, expires_in, refresh_token } = response.data

    if (!access_token) {
      throw new AppError('Invalid access token response from Amazon', 500)
    }

    // Cache the token in Redis (with in-memory fallback)
    const expiresAt = Date.now() + (expires_in * 1000) - 60000 // Subtract 1 minute for safety
    const ttlSeconds = Math.floor((expiresAt - Date.now()) / 1000)
    
    await redisService.set(
      cacheKey,
      {
        accessToken: access_token,
        expiresAt,
      },
      ttlSeconds > 0 ? ttlSeconds : expires_in // Use calculated TTL or fallback to expires_in
    )

    logger.info('Successfully obtained access token', {
      clientId: clientId.substring(0, 20) + '...',
      expiresIn: expires_in,
      tokenRotated: !!refresh_token,
    })

    return {
      access_token,
      token_type: token_type || 'Bearer',
      expires_in,
      refresh_token, // Only present if Amazon rotated the token
    }
  } catch (error) {
    const axiosError = error as AxiosError

    // Handle specific error cases
    if (axiosError.response) {
      const status = axiosError.response.status
      const data = axiosError.response.data as any

      if (status === 400) {
        const errorDescription = data?.error_description || data?.error || 'Unknown error'
        logger.error('Invalid refresh token or credentials', {
          clientId,
          error: errorDescription,
          errorCode: data?.error,
          fullResponse: JSON.stringify(data),
        })
        throw new AppError(
          `Invalid refresh token or credentials: ${errorDescription}`,
          401
        )
      }

      if (status === 401) {
        const errorDescription = data?.error_description || data?.error || 'Unknown error'
        const errorCode = data?.error || 'unknown_error'
        
        // Check if this is a client authentication failure (missing client secret)
        const isClientAuthError = errorCode === 'invalid_client' || errorDescription.toLowerCase().includes('client authentication')
        const isSolutionId = clientId?.includes('sp.solution')
        
        let errorMessage = `Refresh token expired or revoked: ${errorDescription}. Please re-authorize.`
        
        // Provide specific guidance for Solution IDs requiring client secret
        if (isClientAuthError && isSolutionId && (!clientSecret || clientSecret.trim() === '')) {
          errorMessage = `Client authentication failed: Solution IDs (amzn1.sp.solution.xxx) require a client secret. ` +
            `Please add SANDBOX_CLIENT_SECRET to your .env file, or use an Application ID (amzn1.application-oa2-client.xxx) instead. ` +
            `See SANDBOX_LIMITATION.md for details.`
        }
        
        logger.error('Unauthorized - refresh token may be expired or revoked', {
          clientId: clientId?.substring(0, 20) + '...',
          error: errorDescription,
          errorCode,
          isSolutionId,
          hasClientSecret: !!(clientSecret && clientSecret.trim() !== ''),
          fullResponse: JSON.stringify(data),
        })
        
        throw new AppError(errorMessage, 401)
      }

      logger.error('Failed to exchange refresh token', {
        clientId,
        status,
        error: data?.error_description || data?.error,
      })
      throw new AppError('Failed to obtain access token from Amazon', 500)
    }

    if (axiosError.code === 'ECONNABORTED') {
      logger.error('Timeout while exchanging refresh token', { clientId })
      throw new AppError('Timeout while connecting to Amazon', 504)
    }

    logger.error('Unexpected error during token exchange', {
      clientId: clientId.substring(0, 20) + '...',
      error: axiosError.message,
    })
    throw new AppError('Unexpected error during token exchange', 500)
  } finally {
    // Release lock if we acquired it
    if (lockAcquired) {
      await redisService.releaseLock(lockKey, lockValue)
    }
  }
}

/**
 * Clear cached token for a specific credential set
 * 
 * Useful when a refresh token is revoked or updated
 * 
 * @param clientId - LWA client ID
 * @param refreshToken - Refresh token (first 10 chars used for cache key)
 */
export async function clearTokenCache(clientId: string, refreshToken: string): Promise<void> {
  const cacheKey = `token:${clientId}:${refreshToken.substring(0, 10)}`
  await redisService.del(cacheKey)
  logger.debug('Cleared token cache', { clientId: clientId.substring(0, 20) + '...' })
}

/**
 * Clear all cached tokens
 * 
 * Useful for testing or when rotating all credentials
 * 
 * Note: This only clears tokens with the "token:" prefix
 */
export async function clearAllTokenCache(): Promise<void> {
  // Note: In production, you might want to use SCAN to find all token keys
  // For now, this is a placeholder - individual token clearing is preferred
  logger.debug('clearAllTokenCache called (use clearTokenCache for specific tokens)')
  // In a real implementation with Redis, you could use:
  // const client = getRedisClient()
  // if (client) {
  //   const keys = await client.keys('token:*')
  //   if (keys.length > 0) {
  //     await client.del(...keys)
  //   }
  // }
}

/**
 * Get cache statistics (for monitoring)
 */
export async function getTokenCacheStats(): Promise<{ size: number; keys: string[] }> {
  // Note: Getting all keys is expensive in Redis, so we return a simplified version
  const stats = await redisService.getStats()
  return {
    size: stats.memoryStoreSize, // Approximate
    keys: [], // Don't fetch all keys in production
  }
}
