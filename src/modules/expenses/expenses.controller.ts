import { Response, NextFunction } from 'express'
import { AuthRequest } from '../../middlewares/auth.middleware'
import * as expensesService from './expenses.service'

export async function getExpenses(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    const result = await expensesService.getExpenses(req.userId, req.query)
    res.status(200).json(result)
  } catch (error) {
    next(error)
  }
}

export async function createExpense(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    const result = await expensesService.createExpense(req.userId, req.body)
    res.status(201).json(result)
  } catch (error) {
    next(error)
  }
}

export async function updateExpense(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    const { id } = req.params
    const result = await expensesService.updateExpense(req.userId, id, req.body)
    res.status(200).json(result)
  } catch (error) {
    next(error)
  }
}

export async function deleteExpense(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    const { id } = req.params
    const result = await expensesService.deleteExpense(req.userId, id)
    res.status(200).json(result)
  } catch (error) {
    next(error)
  }
}

