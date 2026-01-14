import { Response, NextFunction } from 'express'
import { AuthRequest } from '../../../middlewares/auth.middleware'
import * as cogsService from './cogs.service'

export async function getCogsForSku(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const { sku } = req.params
    const accountId = (req.query.accountId as string) || req.user?.accountId
    if (!accountId) {
      res.status(400).json({ error: 'accountId is required' })
      return
    }

    const result = await cogsService.getCogsBySku(req.userId, accountId, sku)
    res.status(200).json(result)
  } catch (error) {
    next(error)
  }
}

export async function createCogs(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const result = await cogsService.createCogs(req.userId, req.body)
    res.status(201).json(result)
  } catch (error) {
    next(error)
  }
}

export async function updateCogs(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const { id } = req.params
    const accountId = (req.query.accountId as string) || req.user?.accountId
    if (!accountId) {
      res.status(400).json({ error: 'accountId is required' })
      return
    }

    const result = await cogsService.updateCogs(req.userId, id, accountId, req.body)
    res.status(200).json(result)
  } catch (error) {
    next(error)
  }
}

export async function getBatchDetails(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const { batchId } = req.params
    const accountId = (req.query.accountId as string) || req.user?.accountId
    const result = await cogsService.getBatchCogsDetails(req.userId, batchId, accountId)
    res.status(200).json(result)
  } catch (error) {
    next(error)
  }
}

export async function getHistory(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const accountId = (req.query.accountId as string) || req.user?.accountId
    if (!accountId) {
      res.status(400).json({ error: 'accountId is required' })
      return
    }

    const result = await cogsService.getCogsHistory(req.userId, {
      accountId,
      sku: (req.query.sku as string) || undefined,
      marketplaceId: (req.query.marketplaceId as string) || undefined,
      startDate: (req.query.startDate as string) || undefined,
      endDate: (req.query.endDate as string) || undefined,
      costMethod:
        req.query.costMethod === 'BATCH' ||
        req.query.costMethod === 'TIME_PERIOD' ||
        req.query.costMethod === 'WEIGHTED_AVERAGE'
          ? req.query.costMethod
          : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      offset: req.query.offset ? Number(req.query.offset) : undefined,
    })

    res.status(200).json(result)
  } catch (error) {
    next(error)
  }
}

