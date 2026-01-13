import { Response, NextFunction } from 'express'
import { AuthRequest } from '../../middlewares/auth.middleware'
import * as profitService from './profit.service'

/**
 * Profit controller
 * Handles HTTP requests and responses
 * Delegates business logic to profit.service
 */

/**
 * Get profit report
 * GET /api/profit/report
 */
export async function getProfitReport(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const { accountId, startDate, endDate, productId } = req.query

    const result = await profitService.calculateProfit(
      {
        accountId: accountId as string,
        startDate: startDate as string,
        endDate: endDate as string,
        productId: productId as string,
      },
      req.userId
    )

    res.status(200).json(result)
  } catch (error) {
    next(error)
  }
}

/**
 * Get profit trends
 * GET /api/profit/trends
 */
export async function getProfitTrends(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const { accountId, startDate, endDate } = req.query

    const result = await profitService.getProfitTrends(
      {
        accountId: accountId as string,
        startDate: startDate as string,
        endDate: endDate as string,
      },
      req.userId
    )

    res.status(200).json(result)
  } catch (error) {
    next(error)
  }
}

/**
 * Get profit summary
 * GET /api/profit/summary
 */
export async function getProfitSummary(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const { accountId, startDate, endDate } = req.query

    const result = await profitService.getProfitSummary(
      {
        accountId: accountId as string,
        startDate: startDate as string,
        endDate: endDate as string,
      },
      req.userId
    )

    res.status(200).json(result)
  } catch (error) {
    next(error)
  }
}

