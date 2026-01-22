import { Response, NextFunction } from 'express'
import { AuthRequest } from '../../middlewares/auth.middleware'
import * as profitService from './profit.service'
import { ProfitFilters } from '../../types/profit.types'
import { logger } from '../../config/logger'

/**
 * Profit Controller
 * 
 * Handles HTTP requests and responses for profit calculations
 * Delegates business logic to profit.service
 * 
 * All endpoints require authentication and profit.read permission
 */

/**
 * GET /profit/summary
 * Get aggregated profit summary metrics
 * 
 * Query Parameters:
 * - accountId: Filter by account ID
 * - amazonAccountId: Filter by Amazon account ID
 * - marketplaceId: Filter by marketplace ID
 * - sku: Filter by SKU
 * - startDate: Start date (ISO format)
 * - endDate: End date (ISO format)
 * 
 * Returns: ProfitSummary with aggregated metrics
 */
export async function getProfitSummary(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const filters: ProfitFilters = {
      accountId: req.query.accountId as string | undefined,
      amazonAccountId: req.query.amazonAccountId as string | undefined,
      marketplaceId: req.query.marketplaceId as string | undefined,
      sku: req.query.sku as string | undefined,
      startDate: req.query.startDate as string | undefined,
      endDate: req.query.endDate as string | undefined,
    }

    const result = await profitService.getProfitSummary(filters, req.userId)

    res.status(200).json({
      success: true,
      data: result,
    })
  } catch (error: any) {
    logger.error('Failed to get profit summary', { error, userId: req.userId })
    next(error)
  }
}

/**
 * GET /profit/by-product
 * Get profit breakdown by product/SKU
 * 
 * Query Parameters:
 * - accountId: Filter by account ID
 * - amazonAccountId: Filter by Amazon account ID
 * - marketplaceId: Filter by marketplace ID
 * - startDate: Start date (ISO format)
 * - endDate: End date (ISO format)
 * 
 * Returns: Array of ProductProfitBreakdown
 */
export async function getProfitByProduct(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const filters: ProfitFilters = {
      accountId: req.query.accountId as string | undefined,
      amazonAccountId: req.query.amazonAccountId as string | undefined,
      marketplaceId: req.query.marketplaceId as string | undefined,
      startDate: req.query.startDate as string | undefined,
      endDate: req.query.endDate as string | undefined,
    }

    const result = await profitService.getProfitByProduct(filters, req.userId)

    res.status(200).json({
      success: true,
      data: result,
      totalRecords: result.length,
    })
  } catch (error: any) {
    logger.error('Failed to get profit by product', { error, userId: req.userId })
    next(error)
  }
}

/**
 * GET /profit/by-marketplace
 * Get profit breakdown by marketplace
 * 
 * Query Parameters:
 * - accountId: Filter by account ID
 * - amazonAccountId: Filter by Amazon account ID
 * - startDate: Start date (ISO format)
 * - endDate: End date (ISO format)
 * 
 * Returns: Array of MarketplaceProfitBreakdown
 */
export async function getProfitByMarketplace(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const filters: ProfitFilters = {
      accountId: req.query.accountId as string | undefined,
      amazonAccountId: req.query.amazonAccountId as string | undefined,
      startDate: req.query.startDate as string | undefined,
      endDate: req.query.endDate as string | undefined,
    }

    const result = await profitService.getProfitByMarketplace(filters, req.userId)

    res.status(200).json({
      success: true,
      data: result,
      totalRecords: result.length,
    })
  } catch (error: any) {
    logger.error('Failed to get profit by marketplace', { error, userId: req.userId })
    next(error)
  }
}

/**
 * GET /profit/trends
 * Get profit trends over time for chart visualization
 * 
 * Query Parameters:
 * - accountId: Filter by account ID
 * - amazonAccountId: Filter by Amazon account ID
 * - marketplaceId: Filter by marketplace ID
 * - sku: Filter by SKU
 * - startDate: Start date (ISO format)
 * - endDate: End date (ISO format)
 * - period: Grouping period ('day', 'week', 'month')
 * 
 * Returns: ProfitTrendsResponse with time-series data
 */
export async function getProfitTrends(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const filters: ProfitFilters = {
      accountId: req.query.accountId as string | undefined,
      amazonAccountId: req.query.amazonAccountId as string | undefined,
      marketplaceId: req.query.marketplaceId as string | undefined,
      sku: req.query.sku as string | undefined,
      startDate: req.query.startDate as string | undefined,
      endDate: req.query.endDate as string | undefined,
      period: (req.query.period as 'day' | 'week' | 'month') || 'day',
    }

    const result = await profitService.getProfitTrends(filters, req.userId)

    res.status(200).json({
      success: true,
      data: result,
    })
  } catch (error: any) {
    logger.error('Failed to get profit trends', { error, userId: req.userId })
    next(error)
  }
}

/**
 * GET /profit/trends/simple
 * Get simplified profit trends for Trends screen
 * 
 * Query Parameters:
 * - accountId: Filter by account ID (optional)
 * - amazonAccountId: Filter by Amazon account ID (optional)
 * - startDate: Start date in ISO format (YYYY-MM-DD) - REQUIRED
 * - endDate: End date in ISO format (YYYY-MM-DD) - REQUIRED
 * - interval: Grouping interval ('daily', 'weekly', 'monthly') - defaults to 'daily'
 * 
 * Returns: Simplified trends response with labels, profit, and revenue arrays
 * 
 * Example Response:
 * {
 *   "labels": ["2026-01-01", "2026-01-02"],
 *   "profit": [1200, 1500],
 *   "revenue": [5000, 6000]
 * }
 * 
 * Architecture Note: This controller function is modular and can be extracted
 * to a microservice. It only depends on:
 * - profitService.getProfitTrendsSimple (business logic)
 * - Authentication middleware (req.userId)
 * - Error handling middleware (next)
 */
export async function getProfitTrendsSimple(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    // Extract and validate query parameters
    const startDate = req.query.startDate as string | undefined
    const endDate = req.query.endDate as string | undefined
    const interval = (req.query.interval as 'daily' | 'weekly' | 'monthly') || 'daily'

    // Validate required parameters
    if (!startDate || !endDate) {
      res.status(400).json({
        success: false,
        error: 'startDate and endDate are required query parameters',
      })
      return
    }

    const filters: ProfitFilters & { interval?: 'daily' | 'weekly' | 'monthly' } = {
      accountId: req.query.accountId as string | undefined,
      amazonAccountId: req.query.amazonAccountId as string | undefined,
      startDate,
      endDate,
      interval,
    }

    const result = await profitService.getProfitTrendsSimple(filters, req.userId)

    res.status(200).json(result)
  } catch (error: any) {
    logger.error('Failed to get simplified profit trends', { error, userId: req.userId })
    next(error)
  }
}

/**
 * GET /profit/trends/products
 * Get product-level trends for Trends screen
 * 
 * Query Parameters:
 * - accountId: Filter by account ID (optional)
 * - marketplaceId: Filter by marketplace ID (optional)
 * - startDate: Start date in ISO format (YYYY-MM-DD) - REQUIRED
 * - endDate: End date in ISO format (YYYY-MM-DD) - REQUIRED
 * - metric: Metric to display ('sales', 'units', 'orders', 'promo', 'advertisingCost', 'refunds', 'refundCost', 'refundsPercent', 'sellableReturns', 'amazonFees', 'estimatedPayout', 'costOfGoods', 'grossProfit', 'indirectExpenses', 'netProfit', 'margin') - defaults to 'sales'
 * 
 * Returns: Product trends response with daily values per product
 * 
 * Example Response:
 * {
 *   "products": [
 *     {
 *       "productId": "xxx",
 *       "sku": "B0FGG3SXRC",
 *       "productTitle": "Beddora Bed Pillows (Queen White)",
 *       "productImageUrl": "https://...",
 *       "dailyValues": [
 *         { "date": "2026-01-20", "value": 111.96, "changePercent": 100 },
 *         { "date": "2026-01-19", "value": 0, "changePercent": -100 }
 *       ],
 *       "chartData": [111.96, 0, 0, ...]
 *     }
 *   ],
 *   "dates": ["2026-01-20", "2026-01-19", ...],
 *   "metric": "sales"
 * }
 * 
 * Architecture Note: This controller function is modular and can be extracted
 * to a microservice. It only depends on:
 * - profitService.getProductTrends (business logic)
 * - Authentication middleware (req.userId)
 * - Error handling middleware (next)
 */
export async function getProductTrends(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    // Extract and validate query parameters
    const startDate = req.query.startDate as string | undefined
    const endDate = req.query.endDate as string | undefined
    const metric = (req.query.metric as string) || 'sales'

    // Validate required parameters
    if (!startDate || !endDate) {
      res.status(400).json({
        success: false,
        error: 'startDate and endDate are required query parameters',
      })
      return
    }

    const filters: ProfitFilters & { metric?: string } = {
      accountId: req.query.accountId as string | undefined,
      marketplaceId: req.query.marketplaceId as string | undefined,
      startDate,
      endDate,
      metric,
    }

    const result = await profitService.getProductTrends(filters, req.userId)

    res.status(200).json(result)
  } catch (error: any) {
    logger.error('Failed to get product trends', { error, userId: req.userId })
    next(error)
  }
}

/**
 * GET /profit/report
 * Legacy endpoint - redirects to summary
 * Kept for backward compatibility
 */
export async function getProfitReport(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Redirect to summary endpoint
  return getProfitSummary(req, res, next)
}

/**
 * GET /profit/by-order-items
 * Get profit breakdown by order items
 * 
 * Query Parameters:
 * - accountId: Filter by account ID
 * - amazonAccountId: Filter by Amazon account ID
 * - marketplaceId: Filter by marketplace ID
 * - startDate: Start date (ISO format)
 * - endDate: End date (ISO format)
 * 
 * Returns: Array of OrderItemProfitBreakdown
 */
export async function getProfitByOrderItems(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const filters: ProfitFilters = {
      accountId: req.query.accountId as string | undefined,
      amazonAccountId: req.query.amazonAccountId as string | undefined,
      marketplaceId: req.query.marketplaceId as string | undefined,
      startDate: req.query.startDate as string | undefined,
      endDate: req.query.endDate as string | undefined,
    }

    const result = await profitService.getProfitByOrderItems(filters, req.userId)

    res.status(200).json({
      success: true,
      data: result,
      totalRecords: result.length,
    })
  } catch (error: any) {
    logger.error('Failed to get profit by order items', { error, userId: req.userId })
    next(error)
  }
}

/**
 * GET /profit/pl
 * Get P&L (Profit & Loss) data grouped by periods
 * 
 * Query Parameters:
 * - accountId: Filter by account ID (required)
 * - marketplaceId: Filter by marketplace ID
 * 
 * Returns: PLResponse with metrics grouped by periods
 */
export async function getPLByPeriods(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const filters: ProfitFilters = {
      accountId: req.query.accountId as string | undefined,
      marketplaceId: req.query.marketplaceId as string | undefined,
    }

    const result = await profitService.getPLByPeriods(filters, req.userId)

    res.status(200).json({
      success: true,
      data: result,
    })
  } catch (error: any) {
    logger.error('Failed to get P&L by periods', { error, userId: req.userId })
    next(error)
  }
}

/**
 * GET /profit/map
 * Get profit breakdown by country for map visualization
 * 
 * Query Parameters:
 * - accountId: Filter by account ID (optional)
 * - amazonAccountId: Filter by Amazon account ID (optional)
 * - startDate: Start date in ISO format (YYYY-MM-DD) - REQUIRED
 * - endDate: End date in ISO format (YYYY-MM-DD) - REQUIRED
 * 
 * Returns: Array of CountryProfitBreakdown with profit and orders per country
 * 
 * Example Response:
 * [
 *   { "country": "US", "profit": 1200.50, "orders": 50 },
 *   { "country": "GB", "profit": 800.25, "orders": 35 }
 * ]
 */
export async function getProfitByCountry(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    // Extract and validate query parameters
    const startDate = req.query.startDate as string | undefined
    const endDate = req.query.endDate as string | undefined

    // Validate required parameters
    if (!startDate || !endDate) {
      res.status(400).json({
        success: false,
        error: 'startDate and endDate are required query parameters',
      })
      return
    }

    const filters: ProfitFilters = {
      accountId: req.query.accountId as string | undefined,
      amazonAccountId: req.query.amazonAccountId as string | undefined,
      startDate,
      endDate,
    }

    const result = await profitService.getProfitByCountry(filters, req.userId)

    res.status(200).json(result)
  } catch (error: any) {
    logger.error('Failed to get profit by country', { error, userId: req.userId })
    
    // Handle validation errors
    if (error.statusCode === 400) {
      res.status(400).json({
        success: false,
        error: error.message,
      })
      return
    }

    // Handle access denied errors
    if (error.statusCode === 403) {
      res.status(403).json({
        success: false,
        error: error.message,
      })
      return
    }

    // Pass other errors to error handler
    next(error)
  }
}