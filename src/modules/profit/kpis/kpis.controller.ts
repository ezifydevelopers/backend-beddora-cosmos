import { Response, NextFunction } from 'express'
import { AuthRequest } from '../../../middlewares/auth.middleware'
import * as kpisService from './kpis.service'
import { KPIFilters } from '../../../types/kpis.types'
import { logger } from '../../../config/logger'

/**
 * KPIs Controller
 * 
 * Handles HTTP requests and responses for KPI calculations
 * Delegates business logic to kpis.service
 * 
 * All endpoints require authentication and profit.read permission
 */

/**
 * GET /profit/kpis/units-sold
 * Get units sold KPI
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
 * Returns: UnitsSoldKPI with aggregated units sold
 */
export async function getUnitsSoldKPI(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const filters: KPIFilters = {
      accountId: req.query.accountId as string | undefined,
      amazonAccountId: req.query.amazonAccountId as string | undefined,
      marketplaceId: req.query.marketplaceId as string | undefined,
      sku: req.query.sku as string | undefined,
      startDate: req.query.startDate as string | undefined,
      endDate: req.query.endDate as string | undefined,
      period: (req.query.period as 'day' | 'week' | 'month') || 'day',
    }

    const result = await kpisService.getUnitsSoldKPI(filters, req.userId)

    res.status(200).json({
      success: true,
      data: result,
    })
  } catch (error: any) {
    logger.error('Failed to get units sold KPI', { error, userId: req.userId })
    next(error)
  }
}

/**
 * GET /profit/kpis/returns-cost
 * Get returns cost KPI
 * 
 * Query Parameters:
 * - accountId: Filter by account ID
 * - amazonAccountId: Filter by Amazon account ID
 * - marketplaceId: Filter by marketplace ID
 * - sku: Filter by SKU
 * - startDate: Start date (ISO format)
 * - endDate: End date (ISO format)
 * 
 * Returns: ReturnsCostKPI with returns breakdown
 */
export async function getReturnsCostKPI(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const filters: KPIFilters = {
      accountId: req.query.accountId as string | undefined,
      amazonAccountId: req.query.amazonAccountId as string | undefined,
      marketplaceId: req.query.marketplaceId as string | undefined,
      sku: req.query.sku as string | undefined,
      startDate: req.query.startDate as string | undefined,
      endDate: req.query.endDate as string | undefined,
    }

    const result = await kpisService.getReturnsCostKPI(filters, req.userId)

    res.status(200).json({
      success: true,
      data: result,
    })
  } catch (error: any) {
    logger.error('Failed to get returns cost KPI', { error, userId: req.userId })
    next(error)
  }
}

/**
 * GET /profit/kpis/advertising-cost
 * Get advertising cost (PPC) KPI
 * 
 * Query Parameters:
 * - accountId: Filter by account ID
 * - amazonAccountId: Filter by Amazon account ID
 * - campaignId: Filter by campaign ID
 * - adGroupId: Filter by ad group ID
 * - keywordId: Filter by keyword ID
 * - startDate: Start date (ISO format)
 * - endDate: End date (ISO format)
 * 
 * Returns: AdvertisingCostKPI with PPC breakdown
 */
export async function getAdvertisingCostKPI(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const filters: KPIFilters = {
      accountId: req.query.accountId as string | undefined,
      amazonAccountId: req.query.amazonAccountId as string | undefined,
      campaignId: req.query.campaignId as string | undefined,
      adGroupId: req.query.adGroupId as string | undefined,
      keywordId: req.query.keywordId as string | undefined,
      startDate: req.query.startDate as string | undefined,
      endDate: req.query.endDate as string | undefined,
    }

    const result = await kpisService.getAdvertisingCostKPI(filters, req.userId)

    res.status(200).json({
      success: true,
      data: result,
    })
  } catch (error: any) {
    logger.error('Failed to get advertising cost KPI', { error, userId: req.userId })
    next(error)
  }
}

/**
 * GET /profit/kpis/fba-fees
 * Get FBA fees KPI
 * 
 * Query Parameters:
 * - accountId: Filter by account ID
 * - amazonAccountId: Filter by Amazon account ID
 * - startDate: Start date (ISO format)
 * - endDate: End date (ISO format)
 * - period: Grouping period ('hour', 'day', 'week', 'month')
 * 
 * Returns: FBAFeesKPI with FBA fees breakdown
 */
export async function getFBAFeesKPI(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const filters: KPIFilters = {
      accountId: req.query.accountId as string | undefined,
      amazonAccountId: req.query.amazonAccountId as string | undefined,
      startDate: req.query.startDate as string | undefined,
      endDate: req.query.endDate as string | undefined,
      period: (req.query.period as 'hour' | 'day' | 'week' | 'month') || 'day',
    }

    const result = await kpisService.getFBAFeesKPI(filters, req.userId)

    res.status(200).json({
      success: true,
      data: result,
    })
  } catch (error: any) {
    logger.error('Failed to get FBA fees KPI', { error, userId: req.userId })
    next(error)
  }
}

/**
 * GET /profit/kpis/payout-estimate
 * Get payout estimate KPI
 * 
 * Query Parameters:
 * - accountId: Filter by account ID
 * - amazonAccountId: Filter by Amazon account ID
 * - marketplaceId: Filter by marketplace ID
 * - startDate: Start date (ISO format)
 * - endDate: End date (ISO format)
 * 
 * Returns: PayoutEstimateKPI with estimated payout breakdown
 */
export async function getPayoutEstimateKPI(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const filters: KPIFilters = {
      accountId: req.query.accountId as string | undefined,
      amazonAccountId: req.query.amazonAccountId as string | undefined,
      marketplaceId: req.query.marketplaceId as string | undefined,
      startDate: req.query.startDate as string | undefined,
      endDate: req.query.endDate as string | undefined,
    }

    const result = await kpisService.getPayoutEstimateKPI(filters, req.userId)

    res.status(200).json({
      success: true,
      data: result,
    })
  } catch (error: any) {
    logger.error('Failed to get payout estimate KPI', { error, userId: req.userId })
    next(error)
  }
}

