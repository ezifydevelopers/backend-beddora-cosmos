/**
 * Refund Discrepancy Controller
 *
 * HTTP request/response handling for refund discrepancies endpoints.
 */

import { Response } from 'express'
import { AuthRequest } from '../../../middlewares/auth.middleware'
import { AppError } from '../../../middlewares/error.middleware'
import * as refundService from './refundDiscrepancy.service'
import {
  validateCreateRefundDiscrepancy,
  validateUpdateRefundDiscrepancy,
} from './refundDiscrepancy.validation'

export async function getRefundDiscrepancies(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }
    const filters: any = {}
    if (req.query.accountId) filters.accountId = req.query.accountId as string
    if (req.query.marketplaceId) filters.marketplaceId = req.query.marketplaceId as string
    if (req.query.productId) filters.productId = req.query.productId as string
    if (req.query.sku) filters.sku = req.query.sku as string
    if (req.query.refundReasonCode) filters.refundReasonCode = req.query.refundReasonCode as string
    if (req.query.status) filters.status = req.query.status as string
    if (req.query.startDate) filters.startDate = new Date(req.query.startDate as string)
    if (req.query.endDate) filters.endDate = new Date(req.query.endDate as string)

    const result = await refundService.getRefundDiscrepancies(req.userId, filters)
    res.status(200).json({ data: result })
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message })
      return
    }
    res.status(500).json({ error: 'Failed to fetch refund discrepancies' })
  }
}

export async function getRefundDiscrepanciesByMarketplace(
  req: AuthRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }
    const { marketplaceId } = req.params
    if (!marketplaceId) {
      res.status(400).json({ error: 'Marketplace ID is required' })
      return
    }

    const filters: any = {}
    if (req.query.accountId) filters.accountId = req.query.accountId as string
    if (req.query.productId) filters.productId = req.query.productId as string
    if (req.query.sku) filters.sku = req.query.sku as string
    if (req.query.refundReasonCode) filters.refundReasonCode = req.query.refundReasonCode as string
    if (req.query.status) filters.status = req.query.status as string
    if (req.query.startDate) filters.startDate = new Date(req.query.startDate as string)
    if (req.query.endDate) filters.endDate = new Date(req.query.endDate as string)

    const result = await refundService.getRefundDiscrepanciesByMarketplace(
      req.userId,
      marketplaceId,
      filters
    )
    res.status(200).json({ data: result })
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message })
      return
    }
    res.status(500).json({ error: 'Failed to fetch refund discrepancies' })
  }
}

export async function createRefundDiscrepancy(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }

    const validation = validateCreateRefundDiscrepancy(req.body)
    if (!validation.success) {
      res.status(400).json({ error: validation.error })
      return
    }

    const discrepancy = await refundService.createRefundDiscrepancy(
      req.userId,
      validation.data
    )
    res.status(201).json({ data: discrepancy })
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message })
      return
    }
    res.status(500).json({ error: 'Failed to create refund discrepancy' })
  }
}

export async function reconcileRefundDiscrepancy(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }
    const { id } = req.params
    if (!id) {
      res.status(400).json({ error: 'Discrepancy ID is required' })
      return
    }

    const validation = validateUpdateRefundDiscrepancy(req.body)
    if (!validation.success) {
      res.status(400).json({ error: validation.error })
      return
    }

    const discrepancy = await refundService.reconcileRefundDiscrepancy(
      req.userId,
      id,
      validation.data
    )
    res.status(200).json({ data: discrepancy })
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message })
      return
    }
    res.status(500).json({ error: 'Failed to reconcile refund discrepancy' })
  }
}

export async function detectRefundDiscrepancies(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }
    const accountId = (req.query.accountId as string) || req.user?.accountId
    const marketplaceId = req.query.marketplaceId as string
    if (!accountId || !marketplaceId) {
      res.status(400).json({ error: 'accountId and marketplaceId are required' })
      return
    }
    const result = await refundService.detectRefundDiscrepancies(
      req.userId,
      accountId,
      marketplaceId
    )
    res.status(200).json({
      data: {
        detected: result.detected,
        message: `Detection completed. ${result.detected} discrepancies created.`,
      },
    })
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message })
      return
    }
    res.status(500).json({ error: 'Failed to detect refund discrepancies' })
  }
}

