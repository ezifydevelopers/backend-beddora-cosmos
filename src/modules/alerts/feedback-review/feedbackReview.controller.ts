import { Response, NextFunction } from 'express'
import { AuthRequest } from '../../../middlewares/auth.middleware'
import * as feedbackService from './feedbackReview.service'

export async function getFeedbackAlerts(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }
    const result = await feedbackService.getFeedbackAlerts(req.userId, req.query as any)
    res.status(200).json({ success: true, data: result })
  } catch (error) {
    next(error)
  }
}

export async function getFeedbackAlertsByAsin(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }
    const result = await feedbackService.getFeedbackAlertsByAsin(
      req.userId,
      req.params.asin,
      req.query as any
    )
    res.status(200).json({ success: true, data: result })
  } catch (error) {
    next(error)
  }
}

export async function markFeedbackAlertResolved(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }
    const result = await feedbackService.markFeedbackAlertResolved(req.userId, req.params.id)
    res.status(200).json({ success: true, data: result })
  } catch (error) {
    next(error)
  }
}

export async function markFeedbackAlertRead(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }
    const result = await feedbackService.markFeedbackAlertRead(req.userId, req.params.id)
    res.status(200).json({ success: true, data: result })
  } catch (error) {
    next(error)
  }
}

