import { Response, NextFunction } from 'express'
import { AuthRequest } from '../../middlewares/auth.middleware'
import * as reimbursementsService from './reimbursements.service'

export async function getReimbursements(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    const result = await reimbursementsService.getReimbursements(req.userId, req.query)
    res.status(200).json(result)
  } catch (error) {
    next(error)
  }
}

export async function createReimbursement(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    const result = await reimbursementsService.createReimbursement(req.userId, req.body)
    res.status(201).json(result)
  } catch (error) {
    next(error)
  }
}

export async function updateReimbursementStatus(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    const { id } = req.params
    const { status } = req.body
    const result = await reimbursementsService.updateReimbursementStatus(req.userId, id, status)
    res.status(200).json(result)
  } catch (error) {
    next(error)
  }
}

