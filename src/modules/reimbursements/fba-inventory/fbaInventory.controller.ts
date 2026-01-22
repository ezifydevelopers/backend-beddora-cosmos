/**
 * FBA Inventory Alert Controller
 * 
 * HTTP request/response handling for FBA inventory alerts endpoints.
 */

import { Response } from 'express'
import { AuthRequest } from '../../../middlewares/auth.middleware'
import * as fbaInventoryService from './fbaInventory.service'
import { AppError } from '../../../middlewares/error.middleware'

/**
 * GET /reimbursements/fba
 * Fetch all FBA lost/damaged inventory alerts
 * Query params: accountId, marketplaceId, productId, sku, alertType, status, startDate, endDate
 */
export async function getFbaInventoryAlerts(
  req: AuthRequest,
  res: Response
): Promise<void> {
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
    if (req.query.alertType) filters.alertType = req.query.alertType as string
    if (req.query.status) filters.status = req.query.status as string
    if (req.query.startDate) filters.startDate = new Date(req.query.startDate as string)
    if (req.query.endDate) filters.endDate = new Date(req.query.endDate as string)

    const result = await fbaInventoryService.getFbaInventoryAlerts(req.userId, filters)
    res.status(200).json({ data: result })
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message })
      return
    }
    res.status(500).json({ error: 'Failed to fetch FBA inventory alerts' })
  }
}

/**
 * GET /reimbursements/fba/:marketplaceId
 * Fetch FBA inventory alerts for a specific marketplace
 */
export async function getFbaInventoryAlertsByMarketplace(
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
    if (req.query.alertType) filters.alertType = req.query.alertType as string
    if (req.query.status) filters.status = req.query.status as string
    if (req.query.startDate) filters.startDate = new Date(req.query.startDate as string)
    if (req.query.endDate) filters.endDate = new Date(req.query.endDate as string)

    const result = await fbaInventoryService.getFbaInventoryAlertsByMarketplace(
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
    res.status(500).json({ error: 'Failed to fetch FBA inventory alerts' })
  }
}

/**
 * GET /reimbursements/fba/alert/:id
 * Get a single FBA inventory alert by ID
 */
export async function getFbaInventoryAlertById(
  req: AuthRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }

    const { id } = req.params
    if (!id) {
      res.status(400).json({ error: 'Alert ID is required' })
      return
    }

    const alert = await fbaInventoryService.getFbaInventoryAlertById(req.userId, id)
    res.status(200).json({ data: alert })
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message })
      return
    }
    res.status(500).json({ error: 'Failed to fetch FBA inventory alert' })
  }
}

/**
 * POST /reimbursements/fba
 * Create a new FBA inventory alert (typically called by detection job)
 */
export async function createFbaInventoryAlert(
  req: AuthRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }

    const {
      marketplaceId,
      productId,
      sku,
      alertType,
      reportedQuantity,
      reimbursedQuantity,
      estimatedAmount,
      notes,
    } = req.body

    if (!marketplaceId || !alertType || !reportedQuantity) {
      res.status(400).json({
        error: 'marketplaceId, alertType, and reportedQuantity are required',
      })
      return
    }

    const alert = await fbaInventoryService.createFbaInventoryAlert(req.userId, {
      marketplaceId,
      productId,
      sku,
      alertType,
      reportedQuantity,
      reimbursedQuantity,
      estimatedAmount,
      notes,
    })

    res.status(201).json({ data: alert })
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message })
      return
    }
    res.status(500).json({ error: 'Failed to create FBA inventory alert' })
  }
}

/**
 * PATCH /reimbursements/fba/:id/resolve
 * Resolve an FBA inventory alert (mark as reimbursed, ignored, or disputed)
 */
export async function resolveFbaInventoryAlert(
  req: AuthRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }

    const { id } = req.params
    if (!id) {
      res.status(400).json({ error: 'Alert ID is required' })
      return
    }

    const { status, reimbursedQuantity, notes } = req.body

    if (!status) {
      res.status(400).json({ error: 'status is required' })
      return
    }

    const alert = await fbaInventoryService.resolveFbaInventoryAlert(req.userId, id, {
      status,
      reimbursedQuantity,
      notes,
    })

    res.status(200).json({ data: alert })
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message })
      return
    }
    res.status(500).json({ error: 'Failed to resolve FBA inventory alert' })
  }
}

/**
 * POST /reimbursements/fba/detect
 * Trigger FBA inventory discrepancy detection
 * Query params: accountId, marketplaceId
 */
export async function detectFbaInventoryDiscrepancies(
  req: AuthRequest,
  res: Response
): Promise<void> {
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

    const result = await fbaInventoryService.detectFbaInventoryDiscrepancies(
      req.userId,
      accountId,
      marketplaceId
    )

    res.status(200).json({
      data: {
        detected: result.detected,
        message: `Detection completed. ${result.detected} new alerts created.`,
      },
    })
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message })
      return
    }
    res.status(500).json({ error: 'Failed to detect FBA inventory discrepancies' })
  }
}

