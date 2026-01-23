/**
 * Inventory Controller
 * 
 * Handles HTTP requests for Amazon Inventory API operations
 * All endpoints require authentication
 */

import { Response, NextFunction } from 'express'
import { AuthRequest } from '../../middlewares/auth.middleware'
import { logger } from '../../config/logger'
import { AppError } from '../../middlewares/error.middleware'
import * as inventoryService from './inventory-api.service'
import type { InventoryHealth } from './inventory-api.service'
import prisma from '../../config/db'

/**
 * GET /amazon/inventory/summaries
 * Get inventory summaries
 */
export async function getInventorySummaries(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const {
      amazonAccountId,
      marketplaceIds,
      details,
      granularityType,
      granularityId,
      nextToken,
    } = req.query

    if (!amazonAccountId) {
      res.status(400).json({ error: 'amazonAccountId is required' })
      return
    }

    // Verify account belongs to user
    const account = await prisma.amazonAccount.findUnique({
      where: { id: amazonAccountId as string },
      select: { userId: true, isActive: true },
    })

    if (!account) {
      res.status(404).json({ error: 'Amazon account not found' })
      return
    }

    if (account.userId !== req.userId) {
      res.status(403).json({ error: 'Access denied' })
      return
    }

    if (!account.isActive) {
      res.status(400).json({ error: 'Amazon account is not active' })
      return
    }

    // Parse marketplace IDs if provided
    const marketplaceIdsArray = marketplaceIds
      ? (marketplaceIds as string).split(',').map((m) => m.trim()).filter(Boolean)
      : undefined

    const detailsBool = details === 'true' || details === undefined

    const result = await inventoryService.getInventorySummaries(
      amazonAccountId as string,
      marketplaceIdsArray,
      detailsBool,
      (granularityType as string) || 'Marketplace',
      granularityId as string | undefined,
      nextToken as string | undefined
    )

    res.status(200).json({
      success: true,
      data: result,
    })
  } catch (error: any) {
    logger.error('Failed to get inventory summaries', {
      error: error.message,
      userId: req.userId,
      amazonAccountId: req.query.amazonAccountId,
    })
    next(error)
  }
}

/**
 * GET /amazon/inventory/items
 * Get detailed inventory items
 */
export async function getInventoryItems(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const { amazonAccountId, marketplaceIds, sellerSkus, nextToken } = req.query

    if (!amazonAccountId) {
      res.status(400).json({ error: 'amazonAccountId is required' })
      return
    }

    // Verify account belongs to user
    const account = await prisma.amazonAccount.findUnique({
      where: { id: amazonAccountId as string },
      select: { userId: true, isActive: true },
    })

    if (!account) {
      res.status(404).json({ error: 'Amazon account not found' })
      return
    }

    if (account.userId !== req.userId) {
      res.status(403).json({ error: 'Access denied' })
      return
    }

    if (!account.isActive) {
      res.status(400).json({ error: 'Amazon account is not active' })
      return
    }

    // Parse marketplace IDs if provided
    const marketplaceIdsArray = marketplaceIds
      ? (marketplaceIds as string).split(',').map((m) => m.trim()).filter(Boolean)
      : undefined

    // Parse SKUs if provided
    const skusArray = sellerSkus
      ? (sellerSkus as string).split(',').map((s) => s.trim()).filter(Boolean)
      : undefined

    const result = await inventoryService.getInventoryItems(
      amazonAccountId as string,
      marketplaceIdsArray,
      skusArray,
      nextToken as string | undefined
    )

    res.status(200).json({
      success: true,
      data: result,
    })
  } catch (error: any) {
    logger.error('Failed to get inventory items', {
      error: error.message,
      userId: req.userId,
      amazonAccountId: req.query.amazonAccountId,
    })
    next(error)
  }
}

/**
 * GET /amazon/inventory/health
 * Get inventory health metrics with detailed FBA metrics
 */
export async function getInventoryHealth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const { amazonAccountId, marketplaceIds, sellerSkus, nextToken, includeMetrics } = req.query

    if (!amazonAccountId) {
      res.status(400).json({ error: 'amazonAccountId is required' })
      return
    }

    // Verify account belongs to user
    const account = await prisma.amazonAccount.findUnique({
      where: { id: amazonAccountId as string },
      select: { userId: true, isActive: true },
    })

    if (!account) {
      res.status(404).json({ error: 'Amazon account not found' })
      return
    }

    if (account.userId !== req.userId) {
      res.status(403).json({ error: 'Access denied' })
      return
    }

    if (!account.isActive) {
      res.status(400).json({ error: 'Amazon account is not active' })
      return
    }

    // Parse marketplace IDs if provided
    const marketplaceIdsArray = marketplaceIds
      ? (marketplaceIds as string).split(',').map((m) => m.trim()).filter(Boolean)
      : undefined

    // Parse SKUs if provided
    const skusArray = sellerSkus
      ? (sellerSkus as string).split(',').map((s) => s.trim()).filter(Boolean)
      : undefined

    const result = await inventoryService.getInventoryHealth(
      amazonAccountId as string,
      marketplaceIdsArray,
      skusArray,
      nextToken as string | undefined
    )

    // Enhance with additional metrics if requested
    const includeMetricsBool = includeMetrics === 'true'
    if (includeMetricsBool && result.payload?.inventoryHealth) {
      // Get summaries to calculate additional metrics
      const summaries = await inventoryService.getAllInventorySummaries(
        amazonAccountId as string,
        marketplaceIdsArray,
        true
      )

      // Create a map of SKU to summary for quick lookup
      const summaryMap = new Map<string, typeof summaries[0]>()
      summaries.forEach((s) => {
        if (s.sellerSku) {
          summaryMap.set(s.sellerSku, s)
        }
      })

      // Enhance health data with calculated metrics
      const enhancedHealth = result.payload.inventoryHealth.map((health) => {
        const summary = health.sellerSku ? summaryMap.get(health.sellerSku) : undefined
        if (summary) {
          // Pass health data to calculate enhanced metrics
          const metrics = inventoryService.calculateInventoryMetrics(summary, health)
          return {
            ...health,
            calculatedMetrics: metrics,
          }
        }
        return health
      })

      res.status(200).json({
        success: true,
        data: {
          ...result.payload,
          inventoryHealth: enhancedHealth,
        },
      })
      return
    }

    res.status(200).json({
      success: true,
      data: result,
    })
  } catch (error: any) {
    logger.error('Failed to get inventory health', {
      error: error.message,
      userId: req.userId,
      amazonAccountId: req.query.amazonAccountId,
    })
    next(error)
  }
}

/**
 * GET /amazon/inventory/sku/:sku
 * Get inventory by SKU
 */
export async function getInventoryBySKU(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const { amazonAccountId, marketplaceIds, details } = req.query
    const { sku } = req.params

    if (!amazonAccountId) {
      res.status(400).json({ error: 'amazonAccountId is required' })
      return
    }

    if (!sku) {
      res.status(400).json({ error: 'sku is required' })
      return
    }

    // Verify account belongs to user
    const account = await prisma.amazonAccount.findUnique({
      where: { id: amazonAccountId as string },
      select: { userId: true, isActive: true },
    })

    if (!account) {
      res.status(404).json({ error: 'Amazon account not found' })
      return
    }

    if (account.userId !== req.userId) {
      res.status(403).json({ error: 'Access denied' })
      return
    }

    if (!account.isActive) {
      res.status(400).json({ error: 'Amazon account is not active' })
      return
    }

    // Parse marketplace IDs if provided
    const marketplaceIdsArray = marketplaceIds
      ? (marketplaceIds as string).split(',').map((m) => m.trim()).filter(Boolean)
      : undefined

    const detailsBool = details === 'true' || details === undefined

    const result = await inventoryService.getInventoryBySKU(
      amazonAccountId as string,
      [sku],
      marketplaceIdsArray,
      detailsBool
    )

    if (result.length === 0) {
      res.status(404).json({ error: 'Inventory not found for SKU' })
      return
    }

    // Get health data for enhanced metrics
    let healthData: InventoryHealth | undefined
    try {
      const healthResult = await inventoryService.getInventoryHealth(
        amazonAccountId as string,
        marketplaceIdsArray,
        [sku]
      )
      healthData = healthResult.payload?.inventoryHealth?.find(
        (h) => h.sellerSku === sku
      )
    } catch (error) {
      // Health data is optional, continue without it
      logger.debug('Could not fetch health data for SKU', { sku, error })
    }

    // Enhance with metrics
    const summary = result[0]
    const parsed = inventoryService.parseInventorySummary(summary)
    const metrics = inventoryService.calculateInventoryMetrics(summary, healthData)

    res.status(200).json({
      success: true,
      data: {
        summary,
        parsed,
        metrics,
        health: healthData || null,
      },
    })
  } catch (error: any) {
    logger.error('Failed to get inventory by SKU', {
      error: error.message,
      userId: req.userId,
      amazonAccountId: req.query.amazonAccountId,
      sku: req.params.sku,
    })
    next(error)
  }
}

/**
 * POST /amazon/inventory/parse
 * Parse inventory summary to structured format
 */
export async function parseInventorySummary(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const { summary } = req.body

    if (!summary) {
      res.status(400).json({ error: 'summary is required' })
      return
    }

    const parsed = inventoryService.parseInventorySummary(summary)
    const metrics = inventoryService.calculateInventoryMetrics(summary)

    res.status(200).json({
      success: true,
      data: {
        parsed,
        metrics,
      },
    })
  } catch (error: any) {
    logger.error('Failed to parse inventory summary', {
      error: error.message,
      userId: req.userId,
    })
    next(error)
  }
}
