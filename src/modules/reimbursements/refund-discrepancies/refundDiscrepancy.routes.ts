/**
 * Refund Discrepancy Routes
 *
 * Defines HTTP endpoints for refund discrepancies detection and management.
 * All routes require authentication and appropriate permissions.
 */

import { Router } from 'express'
import { authenticate } from '../../../middlewares/auth.middleware'
import { requirePermission } from '../../../middlewares/permission.middleware'
import * as refundController from './refundDiscrepancy.controller'

const router = Router()
router.use(authenticate)

/**
 * GET /reimbursements/refund-discrepancies
 */
router.get(
  '/',
  requirePermission('reimbursements', 'read'),
  refundController.getRefundDiscrepancies
)

/**
 * GET /reimbursements/refund-discrepancies/:marketplaceId
 */
router.get(
  '/:marketplaceId',
  requirePermission('reimbursements', 'read'),
  refundController.getRefundDiscrepanciesByMarketplace
)

/**
 * POST /reimbursements/refund-discrepancies
 */
router.post(
  '/',
  requirePermission('reimbursements', 'write'),
  refundController.createRefundDiscrepancy
)

/**
 * PATCH /reimbursements/refund-discrepancies/:id/reconcile
 */
router.patch(
  '/:id/reconcile',
  requirePermission('reimbursements', 'write'),
  refundController.reconcileRefundDiscrepancy
)

/**
 * POST /reimbursements/refund-discrepancies/detect
 */
router.post(
  '/detect',
  requirePermission('reimbursements', 'write'),
  refundController.detectRefundDiscrepancies
)

export default router

