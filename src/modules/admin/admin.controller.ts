import { Response, NextFunction } from 'express'
import { AuthRequest } from '../../middlewares/auth.middleware'
import * as adminService from './admin.service'

export async function getSystemStats(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    const result = await adminService.getSystemStats()
    res.status(200).json(result)
  } catch (error) {
    next(error)
  }
}

export async function getAuditLogs(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    const result = await adminService.getAuditLogs(req.query)
    res.status(200).json(result)
  } catch (error) {
    next(error)
  }
}

