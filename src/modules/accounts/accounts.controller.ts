import { Response, NextFunction } from 'express'
import { AuthRequest } from '../../middlewares/auth.middleware'
import * as accountsService from './accounts.service'

/**
 * Accounts controller
 */

export async function getAccounts(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const result = await accountsService.getUserAccounts(req.userId)
    res.status(200).json(result)
  } catch (error) {
    next(error)
  }
}

export async function createAccount(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const { name, sellerId, region, marketplaceIds } = req.body
    const result = await accountsService.createAccount(req.userId, {
      name,
      sellerId,
      region,
      marketplaceIds,
    })
    res.status(201).json(result)
  } catch (error) {
    next(error)
  }
}

export async function switchAccount(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const { accountId } = req.body
    if (!accountId) {
      res.status(400).json({ error: 'Account ID is required' })
      return
    }

    const result = await accountsService.switchAccount(req.userId, accountId)
    res.status(200).json(result)
  } catch (error) {
    next(error)
  }
}

export async function getAccountMarketplaces(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const { id } = req.params
    const result = await accountsService.getAccountMarketplaces(req.userId, id)
    res.status(200).json(result)
  } catch (error) {
    next(error)
  }
}
