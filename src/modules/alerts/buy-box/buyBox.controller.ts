import { Response, NextFunction } from 'express'
import { AuthRequest } from '../../../middlewares/auth.middleware'
import * as buyBoxService from './buyBox.service'

export async function getBuyBoxAlerts(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }
    const result = await buyBoxService.getBuyBoxAlerts(req.userId, req.query as any)
    res.status(200).json({ success: true, data: result })
  } catch (error) {
    next(error)
  }
}

export async function getBuyBoxAlertsByAsin(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }
    const result = await buyBoxService.getBuyBoxAlertsByAsin(
      req.userId,
      req.params.asin,
      req.query as any
    )
    res.status(200).json({ success: true, data: result })
  } catch (error) {
    next(error)
  }
}

export async function markBuyBoxAlertResolved(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }
    const result = await buyBoxService.markBuyBoxAlertResolved(req.userId, req.params.id)
    res.status(200).json({ success: true, data: result })
  } catch (error) {
    next(error)
  }
}

export async function markBuyBoxAlertRead(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }
    const result = await buyBoxService.markBuyBoxAlertRead(req.userId, req.params.id)
    res.status(200).json({ success: true, data: result })
  } catch (error) {
    next(error)
  }
}

