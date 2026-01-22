import { Response, NextFunction } from 'express'
import { AuthRequest } from '../../../middlewares/auth.middleware'
import * as returnsService from './returns.service'
import { ReturnFilters, ReturnInput, ReturnUpdateInput } from '../../../types/returns.types'
import { logger } from '../../../config/logger'

/**
 * Returns Controller
 * Handles HTTP requests and responses for return management
 */

export async function getReturns(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const filters: ReturnFilters = {
      accountId: req.query.accountId as string | undefined,
      marketplaceId: req.query.marketplaceId as string | undefined,
      sku: req.query.sku as string | undefined,
      reasonCode: req.query.reasonCode as string | undefined,
      startDate: req.query.startDate as string | undefined,
      endDate: req.query.endDate as string | undefined,
    }

    const result = await returnsService.getReturns(req.userId, filters)
    res.status(200).json(result)
  } catch (error: any) {
    logger.error('Failed to get returns', { error, userId: req.userId })
    next(error)
  }
}

export async function createReturn(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const data: ReturnInput = {
      orderId: req.body.orderId,
      sku: req.body.sku,
      accountId: req.body.accountId,
      marketplaceId: req.body.marketplaceId,
      quantityReturned: req.body.quantityReturned,
      reasonCode: req.body.reasonCode,
      refundAmount: req.body.refundAmount,
      feeAmount: req.body.feeAmount,
      isSellable: req.body.isSellable,
    }

    const result = await returnsService.createReturn(req.userId, data)
    res.status(201).json(result)
  } catch (error: any) {
    logger.error('Failed to create return', { error, userId: req.userId })
    next(error)
  }
}

export async function updateReturn(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const { id } = req.params
    const data: ReturnUpdateInput = {
      sku: req.body.sku,
      marketplaceId: req.body.marketplaceId,
      quantityReturned: req.body.quantityReturned,
      reasonCode: req.body.reasonCode,
      refundAmount: req.body.refundAmount,
      feeAmount: req.body.feeAmount,
      isSellable: req.body.isSellable,
    }

    const result = await returnsService.updateReturn(req.userId, id, data)
    res.status(200).json(result)
  } catch (error: any) {
    logger.error('Failed to update return', { error, userId: req.userId })
    next(error)
  }
}

export async function deleteReturn(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const { id } = req.params
    const result = await returnsService.deleteReturn(req.userId, id)
    res.status(200).json(result)
  } catch (error: any) {
    logger.error('Failed to delete return', { error, userId: req.userId })
    next(error)
  }
}

export async function getReturnsSummary(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const filters: ReturnFilters = {
      accountId: req.query.accountId as string | undefined,
      marketplaceId: req.query.marketplaceId as string | undefined,
      sku: req.query.sku as string | undefined,
      reasonCode: req.query.reasonCode as string | undefined,
      startDate: req.query.startDate as string | undefined,
      endDate: req.query.endDate as string | undefined,
      period: (req.query.period as 'day' | 'week' | 'month') || 'day',
    }

    const result = await returnsService.getReturnsSummary(req.userId, filters)
    res.status(200).json({ success: true, data: result })
  } catch (error: any) {
    logger.error('Failed to get returns summary', { error, userId: req.userId })
    next(error)
  }
}

