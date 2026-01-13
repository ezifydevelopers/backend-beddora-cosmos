import { Response, NextFunction } from 'express'
import { Request } from 'express'
import * as marketplacesService from './marketplaces.service'

/**
 * Marketplaces controller
 */

export async function getMarketplaces(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await marketplacesService.getMarketplaces()
    res.status(200).json(result)
  } catch (error) {
    next(error)
  }
}

export async function getMarketplaceById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params
    const result = await marketplacesService.getMarketplaceById(id)
    res.status(200).json(result)
  } catch (error) {
    next(error)
  }
}

