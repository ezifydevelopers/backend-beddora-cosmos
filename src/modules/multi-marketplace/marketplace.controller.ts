/**
 * Multi-Marketplace Controller
 */

import { Response } from 'express'
import { AuthRequest } from '../../middlewares/auth.middleware'
import { AppError } from '../../middlewares/error.middleware'
import * as marketplaceService from './marketplace.service'
import { validateLinkMarketplace, validateUpdateMarketplace } from './marketplace.validation'

function canManageUser(req: AuthRequest, userId: string): boolean {
  if (!req.user) return false
  if (req.userId === userId) return true
  return req.user.roles.includes('ADMIN')
}

export async function getSupportedMarketplaces(req: AuthRequest, res: Response): Promise<void> {
  try {
    const result = await marketplaceService.getSupportedMarketplaces()
    res.status(200).json(result)
  } catch {
    res.status(500).json({ error: 'Failed to fetch marketplaces' })
  }
}

export async function getUserMarketplaces(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }
    const { userId } = req.params
    if (!canManageUser(req, userId)) {
      res.status(403).json({ error: 'Access denied' })
      return
    }
    const result = await marketplaceService.getUserMarketplaces(userId)
    res.status(200).json(result)
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message })
      return
    }
    res.status(500).json({ error: 'Failed to fetch user marketplaces' })
  }
}

export async function linkUserMarketplace(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }
    const { userId } = req.params
    if (!canManageUser(req, userId)) {
      res.status(403).json({ error: 'Access denied' })
      return
    }
    const validation = validateLinkMarketplace(req.body)
    if (!validation.success) {
      res.status(400).json({ error: validation.error })
      return
    }
    const result = await marketplaceService.linkMarketplace(userId, validation.data)
    res.status(201).json(result)
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message })
      return
    }
    res.status(500).json({ error: 'Failed to link marketplace' })
  }
}

export async function updateUserMarketplace(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }
    const { userId, id } = req.params
    if (!id) {
      res.status(400).json({ error: 'Marketplace link ID is required' })
      return
    }
    if (!canManageUser(req, userId)) {
      res.status(403).json({ error: 'Access denied' })
      return
    }
    const validation = validateUpdateMarketplace(req.body)
    if (!validation.success) {
      res.status(400).json({ error: validation.error })
      return
    }
    const result = await marketplaceService.updateUserMarketplace(userId, id, validation.data)
    res.status(200).json(result)
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message })
      return
    }
    res.status(500).json({ error: 'Failed to update marketplace link' })
  }
}

export async function unlinkUserMarketplace(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }
    const { userId, id } = req.params
    if (!id) {
      res.status(400).json({ error: 'Marketplace link ID is required' })
      return
    }
    if (!canManageUser(req, userId)) {
      res.status(403).json({ error: 'Access denied' })
      return
    }
    const result = await marketplaceService.unlinkMarketplace(userId, id)
    res.status(200).json(result)
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message })
      return
    }
    res.status(500).json({ error: 'Failed to unlink marketplace' })
  }
}

