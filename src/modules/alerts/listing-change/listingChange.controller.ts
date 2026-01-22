import { Response, NextFunction } from 'express'
import { AuthRequest } from '../../../middlewares/auth.middleware'
import * as listingChangeService from './listingChange.service'

export async function getListingAlerts(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }
    const result = await listingChangeService.getListingAlerts(req.userId, req.query as any)
    res.status(200).json({ success: true, data: result })
  } catch (error) {
    next(error)
  }
}

export async function getListingAlertsByAsin(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }
    const result = await listingChangeService.getListingAlertsByAsin(
      req.userId,
      req.params.asin,
      req.query as any
    )
    res.status(200).json({ success: true, data: result })
  } catch (error) {
    next(error)
  }
}

export async function markAlertResolved(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }
    const result = await listingChangeService.markAlertResolved(req.userId, req.params.id)
    res.status(200).json({ success: true, data: result })
  } catch (error) {
    next(error)
  }
}

export async function markAlertRead(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }
    const result = await listingChangeService.markAlertRead(req.userId, req.params.id)
    res.status(200).json({ success: true, data: result })
  } catch (error) {
    next(error)
  }
}

