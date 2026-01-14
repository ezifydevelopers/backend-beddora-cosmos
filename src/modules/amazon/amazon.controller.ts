import { Response, NextFunction } from 'express'
import { AuthRequest } from '../../middlewares/auth.middleware'
import * as syncService from './sync.service'
import { logger } from '../../config/logger'

/**
 * Amazon Sync Controller
 * 
 * Handles HTTP requests for Amazon SP API sync operations
 * All endpoints require authentication
 */

/**
 * POST /amazon/sync-orders
 * Sync orders from Amazon
 */
export async function syncOrders(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const { amazonAccountId, startDate, endDate } = req.body

    if (!amazonAccountId) {
      res.status(400).json({ error: 'amazonAccountId is required' })
      return
    }

    const result = await syncService.syncOrders(req.userId, amazonAccountId, {
      startDate,
      endDate,
    })

    res.status(200).json({
      success: true,
      message: 'Orders sync completed',
      data: result,
    })
  } catch (error: any) {
    logger.error('Order sync failed', { error, userId: req.userId })
    next(error)
  }
}

/**
 * POST /amazon/sync-fees
 * Sync fees from Amazon Financial Events API
 */
export async function syncFees(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const { amazonAccountId, startDate, endDate } = req.body

    if (!amazonAccountId) {
      res.status(400).json({ error: 'amazonAccountId is required' })
      return
    }

    const result = await syncService.syncFees(req.userId, amazonAccountId, {
      startDate,
      endDate,
    })

    res.status(200).json({
      success: true,
      message: 'Fees sync completed',
      data: result,
    })
  } catch (error: any) {
    logger.error('Fees sync failed', { error, userId: req.userId })
    next(error)
  }
}

/**
 * POST /amazon/sync-ppc
 * Sync PPC metrics from Amazon Advertising API
 */
export async function syncPPC(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const { amazonAccountId, startDate, endDate } = req.body

    if (!amazonAccountId) {
      res.status(400).json({ error: 'amazonAccountId is required' })
      return
    }

    const result = await syncService.syncPPC(req.userId, amazonAccountId, {
      startDate,
      endDate,
    })

    res.status(200).json({
      success: true,
      message: 'PPC sync completed',
      data: result,
    })
  } catch (error: any) {
    logger.error('PPC sync failed', { error, userId: req.userId })
    next(error)
  }
}

/**
 * POST /amazon/sync-inventory
 * Sync inventory levels from Amazon
 */
export async function syncInventory(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const { amazonAccountId } = req.body

    if (!amazonAccountId) {
      res.status(400).json({ error: 'amazonAccountId is required' })
      return
    }

    const result = await syncService.syncInventory(req.userId, amazonAccountId)

    res.status(200).json({
      success: true,
      message: 'Inventory sync completed',
      data: result,
    })
  } catch (error: any) {
    logger.error('Inventory sync failed', { error, userId: req.userId })
    next(error)
  }
}

/**
 * POST /amazon/sync-listings
 * Sync listing changes and Buy Box status
 */
export async function syncListings(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const { amazonAccountId } = req.body

    if (!amazonAccountId) {
      res.status(400).json({ error: 'amazonAccountId is required' })
      return
    }

    const result = await syncService.syncListings(req.userId, amazonAccountId)

    res.status(200).json({
      success: true,
      message: 'Listings sync completed',
      data: result,
    })
  } catch (error: any) {
    logger.error('Listings sync failed', { error, userId: req.userId })
    next(error)
  }
}

/**
 * POST /amazon/sync-refunds
 * Sync refunds and returns from Amazon
 */
export async function syncRefunds(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const { amazonAccountId, startDate, endDate } = req.body

    if (!amazonAccountId) {
      res.status(400).json({ error: 'amazonAccountId is required' })
      return
    }

    const result = await syncService.syncRefunds(req.userId, amazonAccountId, {
      startDate,
      endDate,
    })

    res.status(200).json({
      success: true,
      message: 'Refunds sync completed',
      data: result,
    })
  } catch (error: any) {
    logger.error('Refunds sync failed', { error, userId: req.userId })
    next(error)
  }
}

/**
 * GET /amazon/sync-logs
 * Get sync logs for the authenticated user
 */
export async function getSyncLogs(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const { amazonAccountId, syncType, limit } = req.query

    const logs = await syncService.getSyncLogs(
      req.userId,
      amazonAccountId as string | undefined,
      syncType as syncService.SyncType | undefined,
      limit ? parseInt(limit as string) : 50
    )

    res.status(200).json({
      success: true,
      data: logs,
    })
  } catch (error: any) {
    logger.error('Failed to get sync logs', { error, userId: req.userId })
    next(error)
  }
}
