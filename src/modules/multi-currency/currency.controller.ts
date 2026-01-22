/**
 * Multi-Currency Controller
 */

import { Response } from 'express'
import { AuthRequest } from '../../middlewares/auth.middleware'
import { AppError } from '../../middlewares/error.middleware'
import * as currencyService from './currency.service'

export async function getCurrencies(req: AuthRequest, res: Response): Promise<void> {
  try {
    const result = await currencyService.getCurrencies()
    res.status(200).json(result)
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message })
      return
    }
    res.status(500).json({ error: 'Failed to fetch currencies' })
  }
}

export async function getExchangeRate(req: AuthRequest, res: Response): Promise<void> {
  try {
    const from = req.query.from as string
    const to = req.query.to as string
    if (!from || !to) {
      res.status(400).json({ error: 'from and to are required' })
      return
    }
    const result = await currencyService.getExchangeRate(from, to)
    res.status(200).json({ data: result })
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message })
      return
    }
    res.status(500).json({ error: 'Failed to fetch exchange rate' })
  }
}

export async function updateRates(req: AuthRequest, res: Response): Promise<void> {
  try {
    const result = await currencyService.updateExchangeRates()
    res.status(200).json({ data: result })
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message })
      return
    }
    res.status(500).json({ error: 'Failed to update exchange rates' })
  }
}

