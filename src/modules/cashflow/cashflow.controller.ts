import { Response, NextFunction } from 'express'
import { AuthRequest } from '../../middlewares/auth.middleware'
import * as cashflowService from './cashflow.service'

export async function getCashflow(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    const result = await cashflowService.getCashflow(req.userId, req.query)
    res.status(200).json(result)
  } catch (error) {
    next(error)
  }
}

export async function createCashflowEntry(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    const result = await cashflowService.createCashflowEntry(req.userId, req.body)
    res.status(201).json(result)
  } catch (error) {
    next(error)
  }
}

