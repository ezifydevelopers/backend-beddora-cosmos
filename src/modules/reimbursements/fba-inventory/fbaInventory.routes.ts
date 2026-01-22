/**
 * FBA Inventory Alert Routes
 * 
 * Defines HTTP endpoints for FBA lost and damaged inventory detection and management.
 * All routes require authentication and appropriate permissions.
 */

import { Router } from 'express'
import { authenticate } from '../../../middlewares/auth.middleware'
import { requirePermission } from '../../../middlewares/permission.middleware'
import * as fbaInventoryController from './fbaInventory.controller'

const router = Router()

// All routes require authentication
router.use(authenticate)

/**
 * GET /reimbursements/fba
 * Fetch all FBA lost/damaged inventory alerts
 * Query params: accountId, marketplaceId, productId, sku, alertType, status, startDate, endDate
 * Permission: reimbursements.read
 */
router.get(
  '/',
  requirePermission('reimbursements', 'read'),
  fbaInventoryController.getFbaInventoryAlerts
)

/**
 * GET /reimbursements/fba/alert/:id
 * Get a single FBA inventory alert by ID
 * Permission: reimbursements.read
 */
router.get(
  '/alert/:id',
  requirePermission('reimbursements', 'read'),
  fbaInventoryController.getFbaInventoryAlertById
)

/**
 * GET /reimbursements/fba/:marketplaceId
 * Fetch FBA inventory alerts for a specific marketplace
 * Permission: reimbursements.read
 */
router.get(
  '/:marketplaceId',
  requirePermission('reimbursements', 'read'),
  fbaInventoryController.getFbaInventoryAlertsByMarketplace
)

/**
 * POST /reimbursements/fba
 * Create a new FBA inventory alert (typically called by detection job)
 * Permission: reimbursements.write
 */
router.post(
  '/',
  requirePermission('reimbursements', 'write'),
  fbaInventoryController.createFbaInventoryAlert
)

/**
 * PATCH /reimbursements/fba/:id/resolve
 * Resolve an FBA inventory alert (mark as reimbursed, ignored, or disputed)
 * Permission: reimbursements.write
 */
router.patch(
  '/:id/resolve',
  requirePermission('reimbursements', 'write'),
  fbaInventoryController.resolveFbaInventoryAlert
)

/**
 * POST /reimbursements/fba/detect
 * Trigger FBA inventory discrepancy detection
 * Query params: accountId, marketplaceId
 * Permission: reimbursements.write
 */
router.post(
  '/detect',
  requirePermission('reimbursements', 'write'),
  fbaInventoryController.detectFbaInventoryDiscrepancies
)

export default router

