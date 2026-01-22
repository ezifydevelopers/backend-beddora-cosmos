/**
 * Reimbursement Case Controller
 */

import { Response } from 'express'
import { AuthRequest } from '../../../middlewares/auth.middleware'
import { AppError } from '../../../middlewares/error.middleware'
import * as caseService from './case.service'
import { validateCreateCase, validateUpdateCase } from './case.validation'

export async function getCases(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }
    const filters: any = {}
    if (req.query.accountId) filters.accountId = req.query.accountId as string
    if (req.query.marketplaceId) filters.marketplaceId = req.query.marketplaceId as string
    if (req.query.productId) filters.productId = req.query.productId as string
    if (req.query.sku) filters.sku = req.query.sku as string
    if (req.query.caseType) filters.caseType = req.query.caseType as string
    if (req.query.submissionStatus) filters.submissionStatus = req.query.submissionStatus as string
    if (req.query.startDate) filters.startDate = new Date(req.query.startDate as string)
    if (req.query.endDate) filters.endDate = new Date(req.query.endDate as string)
    const result = await caseService.getCases(req.userId, filters)
    res.status(200).json({ data: result })
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message })
      return
    }
    res.status(500).json({ error: 'Failed to fetch cases' })
  }
}

export async function getCaseById(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }
    const { id } = req.params
    if (!id) {
      res.status(400).json({ error: 'Case ID is required' })
      return
    }
    const result = await caseService.getCaseById(req.userId, id)
    res.status(200).json({ data: result })
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message })
      return
    }
    res.status(500).json({ error: 'Failed to fetch case' })
  }
}

export async function createCase(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }
    const validation = validateCreateCase(req.body)
    if (!validation.success) {
      res.status(400).json({ error: validation.error })
      return
    }
    const result = await caseService.createCase(req.userId, validation.data)
    res.status(201).json({ data: result })
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message })
      return
    }
    res.status(500).json({ error: 'Failed to create case' })
  }
}

export async function updateCase(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }
    const { id } = req.params
    if (!id) {
      res.status(400).json({ error: 'Case ID is required' })
      return
    }
    const validation = validateUpdateCase(req.body)
    if (!validation.success) {
      res.status(400).json({ error: validation.error })
      return
    }
    const result = await caseService.updateCase(req.userId, id, validation.data)
    res.status(200).json({ data: result })
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message })
      return
    }
    res.status(500).json({ error: 'Failed to update case' })
  }
}

export async function getSellerSupportUrl(req: AuthRequest, res: Response): Promise<void> {
  try {
    const url = caseService.getSellerSupportUrl()
    res.status(200).json({ data: { url } })
  } catch {
    res.status(500).json({ error: 'Failed to fetch seller support URL' })
  }
}

