import { Response, NextFunction } from 'express'
import { AuthRequest } from '../../middlewares/auth.middleware'
import * as inventoryService from './inventory.service'

export async function getProducts(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    const result = await inventoryService.getProducts(req.userId, req.query)
    res.status(200).json(result)
  } catch (error) {
    next(error)
  }
}

export async function getProductById(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    const { id } = req.params
    const result = await inventoryService.getProductById(req.userId, id)
    res.status(200).json(result)
  } catch (error) {
    next(error)
  }
}

export async function updateProduct(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    const { id } = req.params
    const result = await inventoryService.updateProduct(req.userId, id, req.body)
    res.status(200).json(result)
  } catch (error) {
    next(error)
  }
}

export async function getLowStockProducts(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    const result = await inventoryService.getLowStockProducts(req.userId)
    res.status(200).json(result)
  } catch (error) {
    next(error)
  }
}

