import { Response, NextFunction } from 'express'
import { AuthRequest } from '../../middlewares/auth.middleware'
import { logger } from '../../config/logger'
import { AppError } from '../../middlewares/error.middleware'
import { SPAPIWrapper } from './sp-api-wrapper.service'
import { getAmazonAccount } from './account.service'

/**
 * Test Controller
 * 
 * Production-ready controller for testing Amazon SP-API integration.
 * 
 * This controller provides endpoints to verify:
 * - Credential storage and retrieval
 * - Token exchange (refresh token → access token)
 * - IAM role assumption
 * - SP-API authentication chain
 * - Real API calls to Amazon
 * 
 * Architecture:
 * - Controller → Service pattern
 * - Can be extracted to a separate microservice in the future
 */

/**
 * GET /api/amazon/test/orders
 * 
 * Test endpoint to verify SP-API integration by fetching orders.
 * 
 * This endpoint:
 * 1. Retrieves stored Amazon account credentials
 * 2. Exchanges refresh token for access token
 * 3. Assumes IAM role (if configured)
 * 4. Makes authenticated call to Orders API
 * 5. Returns real Amazon data
 * 
 * Query Parameters:
 * - amazonAccountId: AmazonAccount ID (required)
 * - marketplaceId: Marketplace ID (optional, defaults to US)
 * - createdAfter: ISO date string (optional, defaults to 7 days ago)
 * 
 * Returns:
 * - Success: Real orders data from Amazon
 * - Error: Detailed error message
 */
export async function testOrdersAPI(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const amazonAccountId = req.query.amazonAccountId as string
    const marketplaceId = (req.query.marketplaceId as string) || 'ATVPDKIKX0DER' // Default to US
    const createdAfter = req.query.createdAfter as string

    if (!amazonAccountId) {
      res.status(400).json({
        success: false,
        error: 'amazonAccountId query parameter is required',
      })
      return
    }

    // Verify account belongs to user (getAmazonAccount now verifies ownership internally)
    const account = await getAmazonAccount(amazonAccountId, req.userId, false)

    logger.info('Testing SP-API Orders endpoint', {
      userId: req.userId,
      amazonAccountId,
      marketplaceId,
    })

    // Create SP-API wrapper
    const client = new SPAPIWrapper(amazonAccountId)
    await client.initialize()

    // Build query parameters
    const params: any = {
      MarketplaceIds: [marketplaceId],
    }

    // Add createdAfter if provided, otherwise default to 7 days ago
    if (createdAfter) {
      params.CreatedAfter = createdAfter
    } else {
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
      params.CreatedAfter = sevenDaysAgo.toISOString()
    }

    // Make SP-API call
    const ordersData = await client.get('/orders/v0/orders', params)

    logger.info('Successfully fetched orders from SP-API', {
      userId: req.userId,
      amazonAccountId,
      orderCount: (ordersData as any)?.payload?.Orders?.length || 0,
    })

    res.status(200).json({
      success: true,
      message: 'Successfully connected to Amazon SP-API',
      data: {
        amazonAccountId,
        marketplaceId,
        orders: ordersData,
        timestamp: new Date().toISOString(),
      },
    })
  } catch (error: any) {
    logger.error('Failed to test SP-API Orders endpoint', {
      error: error.message,
      userId: req.userId,
      amazonAccountId: req.query.amazonAccountId,
    })
    next(error)
  }
}

/**
 * GET /api/amazon/test/status
 * 
 * Test endpoint to verify credential storage and token exchange without making SP-API calls.
 * 
 * This endpoint:
 * 1. Retrieves stored Amazon account credentials
 * 2. Exchanges refresh token for access token
 * 3. Assumes IAM role (if configured)
 * 4. Returns status without making SP-API calls
 * 
 * Query Parameters:
 * - amazonAccountId: AmazonAccount ID (required)
 * 
 * Returns:
 * - Success: Status of credentials and token exchange
 * - Error: Detailed error message
 */
export async function testStatus(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const amazonAccountId = req.query.amazonAccountId as string

    if (!amazonAccountId) {
      res.status(400).json({
        success: false,
        error: 'amazonAccountId query parameter is required',
      })
      return
    }

    // Verify account belongs to user (getAmazonAccount now verifies ownership internally)
    const account = await getAmazonAccount(amazonAccountId, req.userId, false)

    logger.info('Testing SP-API status', {
      userId: req.userId,
      amazonAccountId,
    })

    // Create SP-API wrapper and initialize (this will test token exchange and IAM)
    const client = new SPAPIWrapper(amazonAccountId)
    await client.initialize()

    // Test token exchange by making a simple request
    // This will trigger token refresh and IAM assumption internally
    // We'll use a lightweight endpoint that doesn't require much data
    try {
      // Try to get marketplace participations (lightweight endpoint)
      await client.get('/sellers/v1/marketplaceParticipations', {})
    } catch (error: any) {
      // Even if this fails, we've tested token exchange and IAM
      // The error might be due to permissions, but credentials are valid
      if (error.statusCode === 403) {
        // 403 means credentials worked but don't have permission for this endpoint
        // This is actually a success - credentials are valid
        logger.info('Credentials valid but insufficient permissions for marketplaceParticipations', {
          userId: req.userId,
          amazonAccountId,
        })
      } else {
        // Re-throw other errors
        throw error
      }
    }

    logger.info('Successfully verified SP-API credentials', {
      userId: req.userId,
      amazonAccountId,
    })

    res.status(200).json({
      success: true,
      message: 'Amazon SP-API credentials are valid',
      data: {
        amazonAccountId,
        amazonSellerId: account.amazonSellerId,
        marketplace: account.marketplace,
        region: account.region,
        hasIAMRole: !!account.iamRoleArn,
        marketplaceIds: account.marketplaceIds,
        lastTokenRefresh: account.lastTokenRefreshAt?.toISOString() || null,
        timestamp: new Date().toISOString(),
      },
    })
  } catch (error: any) {
    logger.error('Failed to test SP-API status', {
      error: error.message,
      userId: req.userId,
      amazonAccountId: req.query.amazonAccountId,
    })
    next(error)
  }
}
