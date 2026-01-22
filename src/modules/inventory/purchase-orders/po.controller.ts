import { Response, NextFunction } from 'express'
import { AuthRequest } from '../../../middlewares/auth.middleware'
import * as poService from './po.service'

export async function listPurchaseOrders(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }

    const result = await poService.listPurchaseOrders(req.userId, req.query as any)
    res.status(200).json({ success: true, data: result })
  } catch (error) {
    next(error)
  }
}

export async function getPurchaseOrder(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }

    const { id } = req.params
    const { accountId } = req.query as any
    const result = await poService.getPurchaseOrderById(req.userId, id, accountId)
    res.status(200).json({ success: true, data: result })
  } catch (error) {
    next(error)
  }
}

export async function createPurchaseOrder(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }

    const result = await poService.createPurchaseOrder(req.userId, req.body)
    res.status(201).json({ success: true, data: result })
  } catch (error) {
    next(error)
  }
}

export async function updatePurchaseOrder(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }

    const { id } = req.params
    const result = await poService.updatePurchaseOrder(req.userId, id, req.body)
    res.status(200).json({ success: true, data: result })
  } catch (error) {
    next(error)
  }
}

export async function cancelPurchaseOrder(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }

    const { id } = req.params
    const { accountId } = req.query as any
    await poService.cancelPurchaseOrder(req.userId, id, accountId)
    res.status(200).json({ success: true })
  } catch (error) {
    next(error)
  }
}

export async function duplicatePurchaseOrder(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }

    const { id } = req.params
    const { accountId, poNumber } = req.body
    const result = await poService.duplicatePurchaseOrder(req.userId, id, accountId, poNumber)
    res.status(201).json({ success: true, data: result })
  } catch (error) {
    next(error)
  }
}

export async function getPurchaseOrderAlerts(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }

    const result = await poService.getPurchaseOrderAlerts(req.userId, req.query as any)
    res.status(200).json({ success: true, data: result })
  } catch (error) {
    next(error)
  }
}

