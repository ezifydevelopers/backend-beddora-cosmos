/**
 * Amazon SP-API OAuth Service
 * 
 * Handles OAuth 2.0 authorization flow for Amazon Seller Partner API
 * 
 * Flow:
 * 1. Generate authorization URL with state (CSRF protection)
 * 2. User authorizes on Amazon
 * 3. Amazon redirects back with authorization code
 * 4. Exchange authorization code for refresh token
 * 5. Store credentials in database
 * 
 * Security:
 * - State parameter prevents CSRF attacks
 * - State stored in database with expiration
 * - Refresh tokens encrypted before storage
 * 
 * Architecture:
 * - Modular service, can be extracted to microservice
 * - Reuses token service for token exchange
 * - Integrates with account service for storage
 */

import crypto from 'crypto'
import axios, { AxiosError } from 'axios'
import prisma from '../../config/db'
import { logger } from '../../config/logger'
import { AppError } from '../../middlewares/error.middleware'
import { env } from '../../config/env'
import { auditOAuthEvent, auditCredentialChange } from '../../utils/audit.service'
import { validateRedirectUri } from '../../utils/security.utils'

/**
 * OAuth State (for CSRF protection)
 * Stored temporarily in Redis and database during authorization flow
 */

/**
 * Authorization URL parameters
 */
export interface AuthorizationUrlParams {
  userId: string
  clientId: string
  redirectUri: string
  marketplace?: string // Optional marketplace code (e.g., 'US', 'CA')
  state?: string // Optional custom state (if not provided, will be generated)
}

/**
 * Authorization URL response
 */
export interface AuthorizationUrlResponse {
  authorizationUrl: string
  state: string // Return state for frontend to verify
}

/**
 * OAuth callback parameters
 */
export interface OAuthCallbackParams {
  code: string
  state: string
  sellingPartnerId?: string // Amazon Seller ID (optional, can be extracted from token)
  marketplaceIds?: string[] // Marketplace IDs user authorized
}

/**
 * OAuth callback result
 */
export interface OAuthCallbackResult {
  amazonAccountId: string
  marketplace: string
  amazonSellerId: string
  marketplaceIds: string[]
}

/**
 * Generate authorization URL for Amazon SP-API OAuth
 * 
 * @param params - Authorization parameters
 * @returns Authorization URL and state token
 */
export async function generateAuthorizationUrl(
  params: AuthorizationUrlParams
): Promise<AuthorizationUrlResponse> {
  const { userId, clientId, redirectUri, marketplace, state: customState } = params

  // Validate inputs
  if (!userId || !clientId || !redirectUri) {
    throw new AppError('Missing required parameters: userId, clientId, and redirectUri are required', 400)
  }

  // Validate redirect URI format and prevent open redirect vulnerabilities
  if (!validateRedirectUri(redirectUri)) {
    throw new AppError('Invalid redirect URI: must be a valid HTTP/HTTPS URL from allowed domains', 400)
  }

  // Generate CSRF state token
  const state = customState || crypto.randomBytes(32).toString('hex')

  // Store state in Redis (with database fallback) with expiration (10 minutes)
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
  const ttlSeconds = 10 * 60 // 10 minutes

  try {
    // Try Redis first (faster, better for scaling)
    const redisService = await import('../../utils/redis.service')
    const stateKey = `oauth:state:${state}`
    
    await redisService.set(
      stateKey,
      {
        userId,
        state,
        redirectUri,
        marketplace: marketplace || null,
        expiresAt: expiresAt.getTime(),
      },
      ttlSeconds
    )

    // Also store in database for persistence (optional, but recommended)
    try {
      await (prisma as any).oAuthState.create({
        data: {
          userId,
          state,
          redirectUri,
          marketplace: marketplace || null,
          expiresAt,
        },
      })
    } catch (dbError) {
      // Database storage is optional - log but don't fail
      logger.debug('Could not store OAuth state in database (Redis storage succeeded)', {
        error: (dbError as Error).message,
      })
    }
  } catch (error) {
    logger.error('Failed to store OAuth state', {
      error: (error as Error).message,
      userId,
    })
    throw new AppError('Failed to initialize OAuth flow. Please try again.', 500)
  }

  // Build authorization URL
  // Amazon SP-API OAuth endpoint
  const authBaseUrl = 'https://sellercentral.amazon.com/apps/authorize/consent'
  
  const authParams = new URLSearchParams({
    application_id: clientId,
    state: state,
    redirect_uri: redirectUri,
    version: 'beta', // SP-API uses 'beta' version
  })

  // Add marketplace if specified
  if (marketplace) {
    authParams.append('marketplace', marketplace)
  }

  const authorizationUrl = `${authBaseUrl}?${authParams.toString()}`

  logger.info('Generated authorization URL', {
    userId,
    clientId: clientId.substring(0, 20) + '...',
    redirectUri,
    marketplace,
    stateLength: state.length,
  })

  return {
    authorizationUrl,
    state,
  }
}

/**
 * Handle OAuth callback and exchange authorization code for refresh token
 * 
 * @param params - Callback parameters from Amazon
 * @param userId - User ID (from authenticated session)
 * @returns Created Amazon account details
 */
export async function handleOAuthCallback(
  params: OAuthCallbackParams,
  userId: string
): Promise<OAuthCallbackResult> {
  const { code, state, sellingPartnerId, marketplaceIds = [] } = params

  // Validate inputs
  if (!code || !state) {
    throw new AppError('Missing required parameters: code and state are required', 400)
  }

  // Verify state (CSRF protection)
  // Try Redis first, then fallback to database
  const redisService = await import('../../utils/redis.service')
  const stateKey = `oauth:state:${state}`
  
  let stateRecord: any = await redisService.get(stateKey)

  // If not in Redis, try database
  if (!stateRecord) {
    stateRecord = await (prisma as any).oAuthState.findUnique({
      where: { state },
    })
    
    // Convert database record to expected format
    if (stateRecord) {
      stateRecord = {
        userId: stateRecord.userId,
        state: stateRecord.state,
        redirectUri: stateRecord.redirectUri,
        marketplace: stateRecord.marketplace,
        expiresAt: stateRecord.expiresAt.getTime(),
      }
    }
  } else {
    // Convert Redis timestamp to Date for comparison
    stateRecord.expiresAt = typeof stateRecord.expiresAt === 'number' 
      ? stateRecord.expiresAt 
      : new Date(stateRecord.expiresAt).getTime()
  }

  if (!stateRecord) {
    throw new AppError('Invalid state token. Please restart the authorization process.', 400)
  }

  // Verify user matches
  if (stateRecord.userId !== userId) {
    throw new AppError('State token does not match current user. Please restart the authorization process.', 403)
  }

  // Verify expiration
  const expiresAtTime = typeof stateRecord.expiresAt === 'number' 
    ? stateRecord.expiresAt 
    : new Date(stateRecord.expiresAt).getTime()
  
  if (expiresAtTime < Date.now()) {
    // Clean up expired state
    await redisService.del(stateKey)
    try {
      const dbRecord = await (prisma as any).oAuthState.findUnique({ where: { state } })
      if (dbRecord) {
        await (prisma as any).oAuthState.delete({ where: { id: dbRecord.id } })
      }
    } catch (dbError) {
      // Ignore database cleanup errors
    }
    throw new AppError('State token has expired. Please restart the authorization process.', 400)
  }

  // Get client credentials from user's account or environment
  // For now, we'll use environment variables (in production, store per-user)
  const clientId = env.amazonSpApiClientId
  const clientSecret = env.amazonSpApiClientSecret

  if (!clientId) {
    throw new AppError('OAuth client ID not configured. Please configure AMAZON_SP_API_CLIENT_ID.', 500)
  }

  // Exchange authorization code for refresh token
  const refreshToken = await exchangeAuthorizationCodeForRefreshToken(
    code,
    clientId,
    clientSecret || '',
    stateRecord.redirectUri
  )

  // Extract seller ID and marketplace from token or use provided values
  // Note: In a real implementation, you might decode the access token to get seller info
  // For now, we'll use the provided sellingPartnerId or extract from token response
  const amazonSellerId = sellingPartnerId || 'UNKNOWN' // Should be extracted from token
  const marketplace = stateRecord.marketplace || 'US' // Default to US

  // Store credentials in database
  const { upsertAmazonAccount } = await import('./account.service')
  
  const account = await upsertAmazonAccount({
    userId,
    amazonSellerId,
    marketplace,
    lwaClientId: clientId,
    lwaClientSecret: clientSecret,
    refreshToken: refreshToken,
    marketplaceIds: marketplaceIds.length > 0 ? marketplaceIds : [],
    region: env.amazonSpApiRegion || 'us-east-1',
  })

  // Clean up used state (from both Redis and database)
  try {
    await redisService.del(stateKey)
    await (prisma as any).oAuthState.delete({
      where: { state },
    })
  } catch (error) {
    logger.debug('Could not clean up OAuth state', { error: (error as Error).message })
  }

  logger.info('Successfully completed OAuth flow', {
    userId,
    amazonAccountId: account.id,
    marketplace,
    amazonSellerId,
  })

  return {
    amazonAccountId: account.id,
    marketplace,
    amazonSellerId,
    marketplaceIds: marketplaceIds.length > 0 ? marketplaceIds : [],
  }
}

/**
 * Exchange authorization code for refresh token
 * 
 * This is the final step of OAuth flow
 * 
 * @param code - Authorization code from Amazon
 * @param clientId - LWA client ID
 * @param clientSecret - LWA client secret (optional for Application IDs)
 * @param redirectUri - Redirect URI (must match the one used in authorization URL)
 * @returns Refresh token
 */
async function exchangeAuthorizationCodeForRefreshToken(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
): Promise<string> {
  const endpoint = 'https://api.amazon.com/auth/o2/token'

  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code: code,
    client_id: clientId,
    redirect_uri: redirectUri,
  })

  // Only add client_secret if provided (Application IDs may not need it)
  if (clientSecret && clientSecret.trim() !== '') {
    params.append('client_secret', clientSecret)
  }

  try {
    const response = await axios.post<{
      access_token: string
      refresh_token: string
      token_type: string
      expires_in: number
    }>(
      endpoint,
      params,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: 10000,
      }
    )

    const { refresh_token, access_token } = response.data

    if (!refresh_token) {
      throw new AppError('Amazon did not return a refresh token', 500)
    }

    logger.info('Successfully exchanged authorization code for tokens', {
      clientId: clientId.substring(0, 20) + '...',
      hasRefreshToken: !!refresh_token,
      hasAccessToken: !!access_token,
    })

    return refresh_token
  } catch (error) {
    const axiosError = error as AxiosError

    if (axiosError.response) {
      const status = axiosError.response.status
      const data = axiosError.response.data as any

      if (status === 400) {
        const errorDescription = data?.error_description || data?.error || 'Invalid authorization code'
        logger.error('Invalid authorization code', {
          error: errorDescription,
          errorCode: data?.error,
        })
        throw new AppError(`Invalid authorization code: ${errorDescription}`, 400)
      }

      if (status === 401) {
        logger.error('Client authentication failed during token exchange', {
          clientId: clientId.substring(0, 20) + '...',
          error: data?.error_description || data?.error,
        })
        throw new AppError('Client authentication failed. Please check your client credentials.', 401)
      }

      logger.error('Failed to exchange authorization code', {
        status,
        error: data?.error_description || data?.error,
      })
      throw new AppError('Failed to exchange authorization code for refresh token', 500)
    }

    if (axiosError.code === 'ECONNABORTED') {
      logger.error('Timeout while exchanging authorization code', { clientId: clientId.substring(0, 20) + '...' })
      throw new AppError('Timeout while connecting to Amazon', 504)
    }

    logger.error('Unexpected error during token exchange', {
      error: axiosError.message,
    })
    throw new AppError('Unexpected error during token exchange', 500)
  }
}

/**
 * Clean up expired OAuth states
 * 
 * This should be run periodically (e.g., via cron job)
 * to clean up expired state tokens from both Redis and database
 */
export async function cleanupExpiredOAuthStates(): Promise<void> {
  try {
    // Clean up from database
    const result = await (prisma as any).oAuthState.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    })
    logger.debug('Cleaned up expired OAuth states from database', { deleted: result.count })

    // Note: Redis automatically expires keys based on TTL, so no manual cleanup needed
    // But we can verify Redis is working
    const redisService = await import('../../utils/redis.service')
    const stats = await redisService.getStats()
    logger.debug('OAuth state cleanup completed', {
      databaseDeleted: result.count,
      redisConnected: stats.isRedisConnected,
    })
  } catch (error) {
    logger.debug('Could not clean up OAuth states', {
      error: (error as Error).message,
    })
  }
}
