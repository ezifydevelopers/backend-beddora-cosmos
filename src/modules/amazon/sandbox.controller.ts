import { Request, Response, NextFunction } from 'express'
import { logger } from '../../config/logger'
import { getSandboxOrders, testSandboxConnection } from './sandbox.service'

// Extend Express Request to include userId from auth middleware
interface AuthRequest extends Request {
  userId?: string
}

/**
 * Sandbox Controller
 * 
 * Production-ready controller for testing Amazon SP-API sandbox integration.
 * 
 * Responsibilities:
 * - Handle HTTP requests for sandbox endpoints
 * - Validate query parameters
 * - Call sandbox service functions
 * - Return JSON responses
 * 
 * Architecture:
 * - Controller → Service pattern
 * - No business logic in controller
 * - Can be extracted to a separate microservice in the future
 */

/**
 * GET /api/amazon/sandbox/orders
 * 
 * Fetch sandbox orders from SP-API using a single account from database.
 * 
 * This endpoint:
 * 1. Gets sandbox credentials from database (AmazonAccount)
 * 2. Exchanges refresh token for access token
 * 3. Makes SP-API call to fetch orders
 * 4. Returns sandbox orders as JSON
 * 
 * Query Parameters:
 * - amazonAccountId: AmazonAccount ID from database (REQUIRED)
 * - marketplaceId: Marketplace ID (optional, defaults to US: 'ATVPDKIKX0DER')
 * - createdAfter: ISO date string (optional, defaults to 7 days ago)
 * 
 * Returns:
 * - Success: JSON with sandbox orders
 * - Error: Error message with appropriate HTTP status
 * 
 * Example:
 * GET /api/amazon/sandbox/orders?amazonAccountId=xxx&marketplaceId=ATVPDKIKX0DER&createdAfter=2024-01-01T00:00:00Z
 */
export async function getSandboxOrdersController(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    // Extract query parameters
    const amazonAccountId = req.query.amazonAccountId as string | undefined
    const marketplaceId = (req.query.marketplaceId as string) || 'ATVPDKIKX0DER' // Default to US
    const createdAfter = req.query.createdAfter as string | undefined

    logger.info('Fetching sandbox orders', {
      amazonAccountId: amazonAccountId || 'using env vars',
      userId: req.userId || 'not required for env vars',
      marketplaceId,
      createdAfter,
    })

    // Call service to fetch sandbox orders
    // If amazonAccountId is provided, use database account; otherwise use environment variables
    const result = await getSandboxOrders(amazonAccountId, req.userId, marketplaceId, createdAfter)

    logger.info('Successfully fetched sandbox orders', {
      orderCount: result.data.length,
      marketplaceId,
    })

    // Return success response
    res.status(200).json(result)
  } catch (error: any) {
    logger.error('Failed to fetch sandbox orders', {
      error: error.message,
      stack: error.stack,
    })
    next(error)
  }
}

/**
 * GET /api/amazon/sandbox/test
 * 
 * Test sandbox connection without fetching orders.
 * 
 * This endpoint:
 * 1. Gets credentials from database (AmazonAccount)
 * 2. Tests token exchange (refresh token → access token)
 * 3. Returns connection status
 * 
 * Query Parameters:
 * - amazonAccountId: AmazonAccount ID from database (REQUIRED)
 * 
 * Returns:
 * - Success: Connection status and account info
 * - Error: Error message
 * 
 * Example:
 * GET /api/amazon/sandbox/test?amazonAccountId=xxx
 */
export async function testSandboxConnectionController(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const amazonAccountId = req.query.amazonAccountId as string | undefined

    logger.info('Testing sandbox connection', {
      amazonAccountId: amazonAccountId || 'using env vars',
      userId: req.userId || 'not required for env vars',
    })

    // Call service to test connection
    // If amazonAccountId is provided, use database account; otherwise use environment variables
    const result = await testSandboxConnection(amazonAccountId, req.userId)

    if (result.success) {
      logger.info('Sandbox connection test successful')
      res.status(200).json(result)
    } else {
      logger.warn('Sandbox connection test failed', { message: result.message })
      res.status(500).json(result)
    }
  } catch (error: any) {
    logger.error('Failed to test sandbox connection', {
      error: error.message,
      stack: error.stack,
    })
    next(error)
  }
}
