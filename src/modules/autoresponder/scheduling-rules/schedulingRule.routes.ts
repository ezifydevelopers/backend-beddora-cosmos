/**
 * Scheduling Rule Routes
 * 
 * Defines HTTP endpoints for scheduling rules management.
 * All routes require authentication and appropriate permissions.
 */

import { Router } from 'express'
import { authenticate } from '../../../middlewares/auth.middleware'
import { requirePermission } from '../../../middlewares/permission.middleware'
import * as schedulingRuleController from './schedulingRule.controller'

const router = Router()

// All routes require authentication
router.use(authenticate)

/**
 * GET /scheduling-rules
 * Fetch all scheduling rules for the authenticated user
 * Query params: accountId, marketplaceId, templateId, isActive
 * Permission: alerts.read
 */
router.get(
  '/',
  requirePermission('alerts', 'read'),
  schedulingRuleController.getSchedulingRules
)

/**
 * GET /scheduling-rules/preview
 * Get preview of scheduled emails based on active rules
 * Query params: accountId, templateId
 * Permission: alerts.read
 */
router.get(
  '/preview',
  requirePermission('alerts', 'read'),
  schedulingRuleController.getSchedulingPreview
)

/**
 * GET /scheduling-rules/:id
 * Get a single scheduling rule by ID
 * Permission: alerts.read
 */
router.get(
  '/:id',
  requirePermission('alerts', 'read'),
  schedulingRuleController.getSchedulingRuleById
)

/**
 * POST /scheduling-rules
 * Create a new scheduling rule
 * Permission: alerts.write
 */
router.post(
  '/',
  requirePermission('alerts', 'write'),
  schedulingRuleController.createSchedulingRule
)

/**
 * PATCH /scheduling-rules/:id
 * Update an existing scheduling rule
 * Permission: alerts.write
 */
router.patch(
  '/:id',
  requirePermission('alerts', 'write'),
  schedulingRuleController.updateSchedulingRule
)

/**
 * DELETE /scheduling-rules/:id
 * Delete a scheduling rule
 * Permission: alerts.write
 */
router.delete(
  '/:id',
  requirePermission('alerts', 'write'),
  schedulingRuleController.deleteSchedulingRule
)

export default router

