import { Response, NextFunction } from 'express'
import { AuthRequest } from '../../../middlewares/auth.middleware'
import * as forecastService from './forecast.service'

export async function getForecasts(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }

    const result = await forecastService.getForecasts(req.userId, req.query as any)
    res.status(200).json({ success: true, data: result })
  } catch (error) {
    next(error)
  }
}

export async function getForecastBySKU(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }

    const { sku } = req.params
    const result = await forecastService.getForecastBySKU(req.userId, sku, req.query as any)
    res.status(200).json({ success: true, data: result })
  } catch (error) {
    next(error)
  }
}

export async function updateForecast(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }

    const { sku } = req.params
    const result = await forecastService.updateForecast(req.userId, sku, req.body)
    res.status(200).json({ success: true, data: result })
  } catch (error) {
    next(error)
  }
}

export async function getRestockAlerts(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }

    const result = await forecastService.getRestockAlerts(req.userId, req.query as any)
    res.status(200).json({ success: true, data: result })
  } catch (error) {
    next(error)
  }
}

