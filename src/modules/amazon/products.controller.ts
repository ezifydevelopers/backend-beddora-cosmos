/**
 * Products Controller
 * 
 * Handles HTTP requests for Amazon Products API operations
 * All endpoints require authentication
 */

import { Response, NextFunction } from 'express'
import { AuthRequest } from '../../middlewares/auth.middleware'
import { logger } from '../../config/logger'
import { AppError } from '../../middlewares/error.middleware'
import * as productsService from './products-api.service'
import prisma from '../../config/db'

/**
 * GET /amazon/products/catalog
 * Get catalog items by ASINs
 */
export async function getCatalogItems(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const { amazonAccountId, asins, marketplaceIds, includedData, locale } = req.query

    if (!amazonAccountId) {
      res.status(400).json({ error: 'amazonAccountId is required' })
      return
    }

    if (!asins) {
      res.status(400).json({ error: 'asins is required (comma-separated)' })
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

    // Parse ASINs
    const asinArray = (asins as string).split(',').map((a) => a.trim()).filter(Boolean)
    if (asinArray.length === 0) {
      res.status(400).json({ error: 'At least one ASIN is required' })
      return
    }

    // Parse marketplace IDs if provided
    const marketplaceIdsArray = marketplaceIds
      ? (marketplaceIds as string).split(',').map((m) => m.trim()).filter(Boolean)
      : undefined

    // Parse included data if provided
    const includedDataArray = includedData
      ? (includedData as string).split(',').map((d) => d.trim()).filter(Boolean)
      : undefined

    const result = await productsService.getCatalogItems(
      amazonAccountId as string,
      asinArray,
      marketplaceIdsArray,
      includedDataArray,
      locale as string | undefined
    )

    res.status(200).json({
      success: true,
      data: result,
    })
  } catch (error: any) {
    logger.error('Failed to get catalog items', {
      error: error.message,
      userId: req.userId,
      amazonAccountId: req.query.amazonAccountId,
    })
    next(error)
  }
}

/**
 * GET /amazon/products/search
 * Search catalog items by keywords
 */
export async function searchCatalogItems(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const { amazonAccountId, keywords, marketplaceIds, pageSize, pageToken, locale } = req.query

    if (!amazonAccountId) {
      res.status(400).json({ error: 'amazonAccountId is required' })
      return
    }

    if (!keywords) {
      res.status(400).json({ error: 'keywords is required' })
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

    const pageSizeNum = pageSize ? parseInt(pageSize as string, 10) : 10

    const result = await productsService.searchCatalogItems(
      amazonAccountId as string,
      keywords as string,
      marketplaceIdsArray,
      pageSizeNum,
      pageToken as string | undefined,
      locale as string | undefined
    )

    res.status(200).json({
      success: true,
      data: result,
    })
  } catch (error: any) {
    logger.error('Failed to search catalog items', {
      error: error.message,
      userId: req.userId,
      amazonAccountId: req.query.amazonAccountId,
    })
    next(error)
  }
}

/**
 * GET /amazon/products/pricing
 * Get product pricing by ASINs or SKUs
 */
export async function getProductPricing(
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
      asins,
      skus,
      marketplaceId,
      itemCondition,
      customerType,
    } = req.query

    if (!amazonAccountId) {
      res.status(400).json({ error: 'amazonAccountId is required' })
      return
    }

    if (!marketplaceId) {
      res.status(400).json({ error: 'marketplaceId is required' })
      return
    }

    if (!asins && !skus) {
      res.status(400).json({ error: 'Either asins or skus is required' })
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

    let result

    if (asins) {
      // Get pricing by ASINs
      const asinArray = (asins as string).split(',').map((a) => a.trim()).filter(Boolean)
      if (asinArray.length === 0) {
        res.status(400).json({ error: 'At least one ASIN is required' })
        return
      }

      result = await productsService.getProductPricing(
        amazonAccountId as string,
        asinArray,
        marketplaceId as string,
        itemCondition as string | undefined,
        customerType as string | undefined
      )
    } else {
      // Get pricing by SKUs
      const skuArray = (skus as string).split(',').map((s) => s.trim()).filter(Boolean)
      if (skuArray.length === 0) {
        res.status(400).json({ error: 'At least one SKU is required' })
        return
      }

      result = await productsService.getProductPricingBySKU(
        amazonAccountId as string,
        skuArray,
        marketplaceId as string,
        itemCondition as string | undefined,
        customerType as string | undefined
      )
    }

    res.status(200).json({
      success: true,
      data: result,
    })
  } catch (error: any) {
    logger.error('Failed to get product pricing', {
      error: error.message,
      userId: req.userId,
      amazonAccountId: req.query.amazonAccountId,
    })
    next(error)
  }
}

/**
 * GET /amazon/products/eligibility
 * Check product eligibility for programs
 */
export async function getProductEligibility(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const { amazonAccountId, asins, program, marketplaceIds } = req.query

    if (!amazonAccountId) {
      res.status(400).json({ error: 'amazonAccountId is required' })
      return
    }

    if (!asins) {
      res.status(400).json({ error: 'asins is required (comma-separated)' })
      return
    }

    if (!program) {
      res.status(400).json({ error: 'program is required (e.g., INBOUND, COMMINGLING)' })
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

    // Parse ASINs
    const asinArray = (asins as string).split(',').map((a) => a.trim()).filter(Boolean)
    if (asinArray.length === 0) {
      res.status(400).json({ error: 'At least one ASIN is required' })
      return
    }

    // Parse marketplace IDs if provided
    const marketplaceIdsArray = marketplaceIds
      ? (marketplaceIds as string).split(',').map((m) => m.trim()).filter(Boolean)
      : undefined

    const result = await productsService.getProductEligibility(
      amazonAccountId as string,
      asinArray,
      program as string,
      marketplaceIdsArray
    )

    res.status(200).json({
      success: true,
      data: result,
    })
  } catch (error: any) {
    logger.error('Failed to get product eligibility', {
      error: error.message,
      userId: req.userId,
      amazonAccountId: req.query.amazonAccountId,
    })
    next(error)
  }
}

/**
 * POST /amazon/products/parse
 * Parse product data from catalog item
 */
export async function parseProductData(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const { catalogItem } = req.body

    if (!catalogItem) {
      res.status(400).json({ error: 'catalogItem is required' })
      return
    }

    const parsed = productsService.parseProductData(catalogItem)

    res.status(200).json({
      success: true,
      data: parsed,
    })
  } catch (error: any) {
    logger.error('Failed to parse product data', {
      error: error.message,
      userId: req.userId,
    })
    next(error)
  }
}
