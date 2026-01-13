import { Response, NextFunction } from 'express'
import { AuthRequest } from '../../middlewares/auth.middleware'
import * as alertsService from './alerts.service'

export async function getAlerts(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    const result = await alertsService.getAlerts(req.userId, req.query)
    res.status(200).json(result)
  } catch (error) {
    next(error)
  }
}

export async function markAlertAsRead(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    const { id } = req.params
    const result = await alertsService.markAlertAsRead(req.userId, id)
    res.status(200).json(result)
  } catch (error) {
    next(error)
  }
}

export async function createAlert(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    const result = await alertsService.createAlert(req.userId, req.body)
    res.status(201).json(result)
  } catch (error) {
    next(error)
  }
}

