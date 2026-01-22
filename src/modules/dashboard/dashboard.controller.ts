import { Response, NextFunction } from 'express'
import { AuthRequest } from '../../middlewares/auth.middleware'
import * as dashboardService from './dashboard.service'

export async function getDashboardSummary(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }

    const accountId = req.query.accountId as string
    if (!accountId) {
      res.status(400).json({ success: false, error: 'accountId is required' })
      return
    }

    const result = await dashboardService.getDashboardSummary(req.userId, accountId)
    res.status(200).json({ success: true, data: result })
  } catch (error) {
    next(error)
  }
}

