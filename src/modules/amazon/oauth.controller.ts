/**
 * Amazon SP-API OAuth Controller
 * 
 * Handles OAuth authorization flow endpoints
 * 
 * Endpoints:
 * - GET /api/amazon/oauth/authorize - Generate authorization URL
 * - GET /api/amazon/oauth/callback - Handle OAuth callback
 * 
 * Security:
 * - All endpoints require authentication
 * - State parameter prevents CSRF attacks
 * - Redirect URIs are validated
 */

import { Response, NextFunction } from 'express'
import { AuthRequest } from '../../middlewares/auth.middleware'
import { AppError } from '../../middlewares/error.middleware'
import * as oauthService from './oauth.service'
import { logger } from '../../config/logger'
import { getClientIP } from '../../utils/security.utils'
import { auditOAuthEvent } from '../../utils/audit.service'

/**
 * Generate OAuth authorization URL
 * GET /api/amazon/oauth/authorize
 * 
 * Query parameters:
 * - clientId: LWA client ID (optional, uses env var if not provided)
 * - redirectUri: Redirect URI after authorization (required)
 * - marketplace: Marketplace code (optional, e.g., 'US', 'CA')
 * 
 * Response:
 * {
 *   authorizationUrl: string,
 *   state: string
 * }
 */
export async function generateAuthorizationUrl(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.id
    const { clientId, redirectUri, marketplace } = req.query

    // Validate redirect URI
    if (!redirectUri || typeof redirectUri !== 'string') {
      throw new AppError('redirectUri query parameter is required', 400)
    }

    // Get client ID from query or environment
    const lwaClientId = (clientId as string) || process.env.AMAZON_SP_API_CLIENT_ID

    if (!lwaClientId) {
      throw new AppError(
        'Client ID not provided and AMAZON_SP_API_CLIENT_ID environment variable is not set',
        400
      )
    }

    // Generate authorization URL
    const result = await oauthService.generateAuthorizationUrl({
      userId,
      clientId: lwaClientId,
      redirectUri,
      marketplace: marketplace as string | undefined,
    })

    res.status(200).json({
      success: true,
      data: result,
    })
  } catch (error) {
    next(error)
  }
}

/**
 * Handle OAuth callback
 * GET /api/amazon/oauth/callback
 * 
 * Query parameters:
 * - code: Authorization code from Amazon (required)
 * - state: State token for CSRF protection (required)
 * - sellingPartnerId: Amazon Seller ID (optional)
 * - marketplaceIds: Comma-separated marketplace IDs (optional)
 * 
 * Response:
 * {
 *   success: true,
 *   data: {
 *     amazonAccountId: string,
 *     marketplace: string,
 *     amazonSellerId: string,
 *     marketplaceIds: string[]
 *   }
 * }
 */
export async function handleOAuthCallback(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.userId || req.user!.id
    const { code, state, sellingPartnerId, marketplaceIds } = req.query

    // Validate required parameters
    if (!code || typeof code !== 'string') {
      throw new AppError('code query parameter is required', 400)
    }

    if (!state || typeof state !== 'string') {
      throw new AppError('state query parameter is required', 400)
    }

    // Parse marketplace IDs if provided
    const parsedMarketplaceIds =
      marketplaceIds && typeof marketplaceIds === 'string'
        ? marketplaceIds.split(',').map((id) => id.trim()).filter(Boolean)
        : []

    // Handle OAuth callback
    const result = await oauthService.handleOAuthCallback(
      {
        code,
        state,
        sellingPartnerId: sellingPartnerId as string | undefined,
        marketplaceIds: parsedMarketplaceIds,
      },
      userId
    )

    logger.info('OAuth callback completed successfully', {
      userId,
      amazonAccountId: result.amazonAccountId,
    })

    res.status(200).json({
      success: true,
      message: 'Amazon account connected successfully',
      data: result,
    })
  } catch (error) {
    logger.error('OAuth callback failed', {
      userId: req.user?.id,
      error: (error as Error).message,
    })
    next(error)
  }
}

/**
 * Get OAuth status/configuration
 * GET /api/amazon/oauth/status
 * 
 * Returns OAuth configuration status (for frontend to check if OAuth is available)
 */
export async function getOAuthStatus(
  _req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const clientId = process.env.AMAZON_SP_API_CLIENT_ID
    const hasClientId = !!clientId
    const hasClientSecret = !!process.env.AMAZON_SP_API_CLIENT_SECRET

    res.status(200).json({
      success: true,
      data: {
        oauthEnabled: hasClientId,
        hasClientId,
        hasClientSecret,
        // Don't expose actual client ID, just indicate if it's configured
        clientIdPrefix: clientId ? clientId.substring(0, 20) + '...' : null,
      },
    })
  } catch (error) {
    next(error)
  }
}
