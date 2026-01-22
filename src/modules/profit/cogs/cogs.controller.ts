import { Response, NextFunction } from 'express'
import { AuthRequest } from '../../../middlewares/auth.middleware'
import * as cogsService from './cogs.service'
import {
  CreateCOGSRequest,
  UpdateCOGSRequest,
  CreateBatchRequest,
} from '../../../types/cogs.types'
import { logger } from '../../../config/logger'

/**
 * COGS Controller
 * 
 * Handles HTTP requests and responses for COGS management
 * Delegates business logic to cogs.service
 * 
 * All endpoints require authentication
 * Update/Delete operations require admin or manager role
 */

/**
 * GET /cogs/:sku
 * Get COGS for a specific SKU
 */
export async function getCOGSBySKU(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const { sku } = req.params
    const accountId = req.query.accountId as string

    if (!accountId) {
      res.status(400).json({ error: 'accountId is required' })
      return
    }

    const result = await cogsService.getCOGSBySKU(sku, accountId, req.userId)

    res.status(200).json({
      success: true,
      data: result,
    })
  } catch (error: any) {
    logger.error('Failed to get COGS by SKU', { error, userId: req.userId, sku: req.params.sku })
    next(error)
  }
}

/**
 * POST /cogs
 * Create new COGS entry
 */
export async function createCOGS(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const data: CreateCOGSRequest = {
      sku: req.body.sku,
      accountId: req.body.accountId,
      marketplaceId: req.body.marketplaceId,
      batchId: req.body.batchId,
      quantity: req.body.quantity,
      unitCost: req.body.unitCost,
      costMethod: req.body.costMethod,
      shipmentCost: req.body.shipmentCost,
      purchaseDate: req.body.purchaseDate,
    }

    const result = await cogsService.createCOGS(data, req.userId)

    res.status(201).json({
      success: true,
      data: result,
    })
  } catch (error: any) {
    logger.error('Failed to create COGS', { error, userId: req.userId })
    next(error)
  }
}

/**
 * PATCH /cogs/:id
 * Update COGS entry (requires admin/manager role)
 */
export async function updateCOGS(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const { id } = req.params
    const data: UpdateCOGSRequest = {
      quantity: req.body.quantity,
      unitCost: req.body.unitCost,
      shipmentCost: req.body.shipmentCost,
      costMethod: req.body.costMethod,
      purchaseDate: req.body.purchaseDate,
    }

    const result = await cogsService.updateCOGS(id, data, req.userId)

    res.status(200).json({
      success: true,
      data: result,
    })
  } catch (error: any) {
    logger.error('Failed to update COGS', { error, userId: req.userId, cogsId: req.params.id })
    next(error)
  }
}

/**
 * GET /cogs/batch/:batchId
 * Get batch details with associated COGS
 */
export async function getBatchDetails(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const { batchId } = req.params

    const result = await cogsService.getBatchDetails(batchId, req.userId)

    res.status(200).json({
      success: true,
      data: result,
    })
  } catch (error: any) {
    logger.error('Failed to get batch details', {
      error,
      userId: req.userId,
      batchId: req.params.batchId,
    })
    next(error)
  }
}

/**
 * POST /cogs/batch
 * Create new batch
 */
export async function createBatch(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const data: CreateBatchRequest = {
      sku: req.body.sku,
      accountId: req.body.accountId,
      quantity: req.body.quantity,
      unitCost: req.body.unitCost,
      notes: req.body.notes,
      receivedAt: req.body.receivedAt,
    }

    const result = await cogsService.createBatch(data, req.userId)

    res.status(201).json({
      success: true,
      data: result,
    })
  } catch (error: any) {
    logger.error('Failed to create batch', { error, userId: req.userId })
    next(error)
  }
}

/**
 * GET /cogs/history
 * Get historical COGS data
 */
export async function getCOGSHistorical(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const accountId = req.query.accountId as string
    const sku = req.query.sku as string | undefined
    const marketplaceId = req.query.marketplaceId as string | undefined
    const startDate = req.query.startDate as string | undefined
    const endDate = req.query.endDate as string | undefined

    if (!accountId) {
      res.status(400).json({ error: 'accountId is required' })
      return
    }

    const result = await cogsService.getCOGSHistorical(
      accountId,
      req.userId,
      sku,
      marketplaceId,
      startDate,
      endDate
    )

    res.status(200).json({
      success: true,
      data: result,
    })
  } catch (error: any) {
    logger.error('Failed to get COGS historical', { error, userId: req.userId })
    next(error)
  }
}

