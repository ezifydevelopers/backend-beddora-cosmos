import { Response, NextFunction } from 'express'
import { AuthRequest } from '../../middlewares/auth.middleware'
import * as accountsService from './accounts.service'

/**
 * Accounts controller
 * Handles HTTP requests for account management
 * 
 * All endpoints require authentication via authenticate middleware
 * User ownership is enforced in the service layer
 */

// ============================================
// INTERNAL ACCOUNT ENDPOINTS
// ============================================

/**
 * GET /accounts
 * List all linked accounts for the logged-in user
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

/**
 * POST /accounts
 * Create a new account for the logged-in user
 */
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

/**
 * POST /accounts/switch
 * Switch the active account for the logged-in user
 */
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

/**
 * GET /accounts/:id/marketplaces
 * Get marketplaces linked to a specific account
 */
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

// ============================================
// AMAZON ACCOUNT ENDPOINTS
// ============================================

/**
 * GET /accounts
 * List all linked Amazon accounts for the logged-in user
 * 
 * Returns: Array of Amazon account metadata (credentials excluded)
 */
export async function getAmazonAccounts(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const accounts = await accountsService.getAmazonAccounts(req.userId)
    res.status(200).json(accounts)
  } catch (error) {
    next(error)
  }
}

/**
 * POST /accounts
 * Link a new Amazon Seller Central account
 * 
 * Body: { marketplace, sellerId, accessKey, secretKey, refreshToken }
 * Returns: Created Amazon account (credentials excluded)
 */
export async function linkAmazonAccount(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const data = req.body
    const account = await accountsService.linkAmazonAccount(req.userId, data)
    res.status(201).json(account)
  } catch (error) {
    next(error)
  }
}

/**
 * PATCH /accounts/:id
 * Update Amazon account credentials
 * 
 * Body: { sellerId?, accessKey?, secretKey?, refreshToken?, isActive? }
 * Returns: Updated Amazon account (credentials excluded)
 */
export async function updateAmazonAccount(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const { id } = req.params
    const data = req.body

    const account = await accountsService.updateAmazonAccount(req.userId, id, data)
    res.status(200).json(account)
  } catch (error) {
    next(error)
  }
}

/**
 * DELETE /accounts/:id
 * Remove (unlink) an Amazon account
 * 
 * Returns: 204 No Content on success
 */
export async function deleteAmazonAccount(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const { id } = req.params
    await accountsService.deleteAmazonAccount(req.userId, id)
    res.status(204).send()
  } catch (error) {
    next(error)
  }
}

/**
 * POST /accounts/switch/:id
 * Set the current active Amazon account in session
 * 
 * Returns: Active Amazon account metadata
 */
export async function switchAmazonAccount(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const { id } = req.params
    const account = await accountsService.switchAmazonAccount(req.userId, id)
    res.status(200).json(account)
  } catch (error) {
    next(error)
  }
}

// ============================================
// LEGACY ENDPOINTS (for backward compatibility)
// ============================================

/**
 * @deprecated Use getAmazonAccounts instead
 * GET /accounts/linked
 * Get linked Amazon accounts (legacy endpoint)
 */
export async function getLinkedAccounts(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const accounts = await accountsService.getAmazonAccounts(req.userId)
    res.json(accounts)
  } catch (error) {
    next(error)
  }
}

/**
 * @deprecated Use deleteAmazonAccount instead
 * DELETE /accounts/linked/:id
 * Delete linked Amazon account (legacy endpoint)
 */
export async function deleteLinkedAccount(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const { id } = req.params
    await accountsService.deleteAmazonAccount(req.userId, id)
    res.status(204).send()
  } catch (error) {
    next(error)
  }
}
