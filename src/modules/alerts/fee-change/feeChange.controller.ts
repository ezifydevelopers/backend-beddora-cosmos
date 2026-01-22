import { Response, NextFunction } from 'express'
import { AuthRequest } from '../../../middlewares/auth.middleware'
import * as feeChangeService from './feeChange.service'

export async function getFeeChangeAlerts(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }
    const result = await feeChangeService.getFeeChangeAlerts(req.userId, req.query as any)
    res.status(200).json({ success: true, data: result })
  } catch (error) {
    next(error)
  }
}

export async function getFeeChangeAlertsByMarketplace(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }
    const result = await feeChangeService.getFeeChangeAlertsByMarketplace(
      req.userId,
      req.params.marketplaceId,
      req.query as any
    )
    res.status(200).json({ success: true, data: result })
  } catch (error) {
    next(error)
  }
}

export async function markFeeChangeAlertResolved(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }
    const result = await feeChangeService.markFeeChangeAlertResolved(req.userId, req.params.id)
    res.status(200).json({ success: true, data: result })
  } catch (error) {
    next(error)
  }
}

export async function markFeeChangeAlertRead(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }
    const result = await feeChangeService.markFeeChangeAlertRead(req.userId, req.params.id)
    res.status(200).json({ success: true, data: result })
  } catch (error) {
    next(error)
  }
}

