/**
 * Tracking & Stats Routes
 * 
 * Defines HTTP endpoints for email tracking and review statistics.
 * All routes require authentication and appropriate permissions.
 */

import { Router } from 'express'
import { authenticate } from '../../../middlewares/auth.middleware'
import { requirePermission } from '../../../middlewares/permission.middleware'
import * as trackingController from './tracking.controller'

const router = Router()

// All routes require authentication
router.use(authenticate)

/**
 * POST /tracking/email/interaction
 * Track an email interaction (webhook/callback endpoint)
 * Permission: alerts.write (for internal tracking)
 */
router.post(
  '/email/interaction',
  requirePermission('alerts', 'write'),
  trackingController.trackEmailInteraction
)

/**
 * GET /tracking/email
 * Get email interaction statistics
 * Query params: accountId, marketplaceId, templateId, productId, sku, startDate, endDate
 * Permission: alerts.read
 */
router.get(
  '/email',
  requirePermission('alerts', 'read'),
  trackingController.getEmailStats
)

/**
 * GET /tracking/email/:templateId
 * Get email stats for a specific template
 * Permission: alerts.read
 */
router.get(
  '/email/:templateId',
  requirePermission('alerts', 'read'),
  trackingController.getEmailStatsByTemplate
)

/**
 * POST /tracking/review
 * Update review statistics when a review is received
 * Permission: alerts.write
 */
router.post(
  '/review',
  requirePermission('alerts', 'write'),
  trackingController.updateReviewStats
)

/**
 * GET /tracking/review
 * Get review generation statistics
 * Query params: accountId, marketplaceId, templateId, productId, asin, sku, startDate, endDate
 * Permission: alerts.read
 */
router.get(
  '/review',
  requirePermission('alerts', 'read'),
  trackingController.getReviewStats
)

/**
 * GET /tracking/review/:asin
 * Get review stats for a specific product/ASIN
 * Permission: alerts.read
 */
router.get(
  '/review/:asin',
  requirePermission('alerts', 'read'),
  trackingController.getReviewStatsByProduct
)

export default router

