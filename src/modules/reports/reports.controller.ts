import { Response, NextFunction } from 'express'
import { AuthRequest } from '../../middlewares/auth.middleware'
import * as reportsService from './reports.service'

export async function getReports(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    const result = await reportsService.getReports(req.userId, req.query)
    res.status(200).json(result)
  } catch (error) {
    next(error)
  }
}

export async function generateReport(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    const result = await reportsService.generateReport(req.userId, req.body)
    res.status(201).json(result)
  } catch (error) {
    next(error)
  }
}

export async function getReportById(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    const { id } = req.params
    const result = await reportsService.getReportById(req.userId, id)
    res.status(200).json(result)
  } catch (error) {
    next(error)
  }
}

