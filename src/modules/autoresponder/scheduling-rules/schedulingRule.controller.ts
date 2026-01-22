/**
 * Scheduling Rule Controller
 * 
 * HTTP request/response handling for scheduling rules endpoints.
 * Handles validation, authentication, and delegates business logic to service.
 */

import { Response } from 'express'
import { AuthRequest } from '../../../middlewares/auth.middleware'
import * as schedulingRuleService from './schedulingRule.service'
import {
  validateCreateSchedulingRule,
  validateUpdateSchedulingRule,
} from './schedulingRule.validation'
import { AppError } from '../../../middlewares/error.middleware'

/**
 * GET /scheduling-rules
 * Fetch all scheduling rules for the authenticated user
 * Query params: accountId, marketplaceId, templateId, isActive
 */
export async function getSchedulingRules(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }

    const filters = {
      accountId: (req.query.accountId as string) || undefined,
      marketplaceId: (req.query.marketplaceId as string) || undefined,
      templateId: (req.query.templateId as string) || undefined,
      isActive:
        req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined,
    }

    const rules = await schedulingRuleService.getSchedulingRules(req.userId, filters)
    res.status(200).json({ data: rules })
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message })
      return
    }
    res.status(500).json({ error: 'Failed to fetch scheduling rules' })
  }
}

/**
 * GET /scheduling-rules/:id
 * Get a single scheduling rule by ID
 */
export async function getSchedulingRuleById(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }

    const { id } = req.params
    if (!id) {
      res.status(400).json({ error: 'Rule ID is required' })
      return
    }

    const rule = await schedulingRuleService.getSchedulingRuleById(req.userId, id)
    res.status(200).json({ data: rule })
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message })
      return
    }
    res.status(500).json({ error: 'Failed to fetch scheduling rule' })
  }
}

/**
 * POST /scheduling-rules
 * Create a new scheduling rule
 */
export async function createSchedulingRule(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }

    const validation = validateCreateSchedulingRule(req.body)
    if (!validation.success) {
      res.status(400).json({ error: validation.error })
      return
    }

    const rule = await schedulingRuleService.createSchedulingRule(req.userId, validation.data)
    res.status(201).json({ data: rule })
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message })
      return
    }
    res.status(500).json({ error: 'Failed to create scheduling rule' })
  }
}

/**
 * PATCH /scheduling-rules/:id
 * Update an existing scheduling rule
 */
export async function updateSchedulingRule(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }

    const { id } = req.params
    if (!id) {
      res.status(400).json({ error: 'Rule ID is required' })
      return
    }

    const validation = validateUpdateSchedulingRule(req.body)
    if (!validation.success) {
      res.status(400).json({ error: validation.error })
      return
    }

    const rule = await schedulingRuleService.updateSchedulingRule(
      req.userId,
      id,
      validation.data
    )
    res.status(200).json({ data: rule })
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message })
      return
    }
    res.status(500).json({ error: 'Failed to update scheduling rule' })
  }
}

/**
 * DELETE /scheduling-rules/:id
 * Delete a scheduling rule
 */
export async function deleteSchedulingRule(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }

    const { id } = req.params
    if (!id) {
      res.status(400).json({ error: 'Rule ID is required' })
      return
    }

    await schedulingRuleService.deleteSchedulingRule(req.userId, id)
    res.status(200).json({ message: 'Scheduling rule deleted successfully' })
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message })
      return
    }
    res.status(500).json({ error: 'Failed to delete scheduling rule' })
  }
}

/**
 * GET /scheduling-rules/preview
 * Get preview of scheduled emails based on active rules
 * Query params: accountId, templateId
 */
export async function getSchedulingPreview(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }

    const filters = {
      accountId: (req.query.accountId as string) || undefined,
      templateId: (req.query.templateId as string) || undefined,
    }

    const preview = await schedulingRuleService.getSchedulingPreview(req.userId, filters)
    res.status(200).json({ data: preview })
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message })
      return
    }
    res.status(500).json({ error: 'Failed to fetch scheduling preview' })
  }
}

