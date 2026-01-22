import { Response, NextFunction } from 'express'
import { AuthRequest } from '../../../middlewares/auth.middleware'
import * as kpisService from './kpis.service'

export async function getInventoryKpis(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }

    const result = await kpisService.getInventoryKpis(req.userId, req.query as any)
    res.status(200).json({ success: true, data: result })
  } catch (error) {
    next(error)
  }
}

export async function getInventoryKpiBySKU(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }

    const { sku } = req.params
    const result = await kpisService.getInventoryKpiBySKU(req.userId, sku, req.query as any)
    res.status(200).json({ success: true, data: result })
  } catch (error) {
    next(error)
  }
}

export async function recalculateInventoryKpis(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }

    const result = await kpisService.recalculateInventoryKpis(req.userId, req.body as any)
    res.status(200).json({ success: true, data: result })
  } catch (error) {
    next(error)
  }
}

