import { Response, NextFunction } from 'express'
import { AuthRequest } from '../../../middlewares/auth.middleware'
import * as expensesService from './expenses.service'
import { ExpenseFilters, ExpenseInput, ExpenseUpdateInput } from '../../../types/expenses.types'
import { logger } from '../../../config/logger'

/**
 * Expenses Controller
 * Handles HTTP requests and responses for expense management
 */

export async function getExpenses(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const filters: ExpenseFilters = {
      accountId: req.query.accountId as string | undefined,
      marketplaceId: req.query.marketplaceId as string | undefined,
      type: req.query.type as any,
      category: req.query.category as string | undefined,
      sku: req.query.sku as string | undefined,
      startDate: req.query.startDate as string | undefined,
      endDate: req.query.endDate as string | undefined,
    }

    const result = await expensesService.getExpenses(req.userId, filters)

    res.status(200).json({
      success: true,
      data: result.expenses,
      summary: result.summary,
      totalRecords: result.totalRecords,
    })
  } catch (error: any) {
    logger.error('Failed to get expenses', { error, userId: req.userId })
    next(error)
  }
}

export async function createExpense(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const data: ExpenseInput = {
      accountId: req.body.accountId,
      marketplaceId: req.body.marketplaceId,
      type: req.body.type,
      category: req.body.category,
      amount: Number(req.body.amount),
      currency: req.body.currency,
      allocatedProducts: req.body.allocatedProducts,
      description: req.body.description,
      incurredAt: req.body.incurredAt,
    }

    const result = await expensesService.createExpense(req.userId, data)

    res.status(201).json(result)
  } catch (error: any) {
    logger.error('Failed to create expense', { error, userId: req.userId })
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
    const data: ExpenseUpdateInput = {
      marketplaceId: req.body.marketplaceId,
      type: req.body.type,
      category: req.body.category,
      amount: req.body.amount !== undefined ? Number(req.body.amount) : undefined,
      currency: req.body.currency,
      allocatedProducts: req.body.allocatedProducts,
      description: req.body.description,
      incurredAt: req.body.incurredAt,
    }

    const result = await expensesService.updateExpense(req.userId, id, data)

    res.status(200).json(result)
  } catch (error: any) {
    logger.error('Failed to update expense', { error, userId: req.userId })
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
  } catch (error: any) {
    logger.error('Failed to delete expense', { error, userId: req.userId })
    next(error)
  }
}

export async function bulkImportExpenses(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' })
      return
    }

    const accountId = (req.body.accountId || req.query.accountId) as string | undefined

    const result = await expensesService.bulkImportExpenses(
      req.userId,
      req.file.path,
      req.file.originalname,
      accountId
    )

    res.status(200).json({
      success: true,
      data: result,
    })
  } catch (error: any) {
    logger.error('Failed to bulk import expenses', { error, userId: req.userId })
    next(error)
  }
}

