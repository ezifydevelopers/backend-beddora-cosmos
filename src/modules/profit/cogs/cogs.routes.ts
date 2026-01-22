import { Router } from 'express'
import * as cogsController from './cogs.controller'
import {
  validateSKU,
  validateCOGSId,
  validateBatchId,
  validateCreateCOGS,
  validateUpdateCOGS,
  validateCreateBatch,
  validateCOGSHistorical,
} from './cogs.validation'
import { authenticate } from '../../../middlewares/auth.middleware'
import { requirePermission } from '../../../middlewares/permission.middleware'
import { validateRequest } from '../../../middlewares/validation.middleware'

/**
 * COGS routes
 * All routes require authentication
 * Update operations require profit.write permission (admin/manager)
 * 
 * Endpoints:
 * - GET /cogs/:sku - Get COGS for a specific SKU
 * - POST /cogs - Create new COGS entry
 * - PATCH /cogs/:id - Update COGS entry (requires admin/manager)
 * - GET /cogs/batch/:batchId - Get batch details
 * - POST /cogs/batch - Create new batch
 * - GET /cogs/history - Get historical COGS data
 */

const router = Router()

// All COGS routes require authentication
router.use(authenticate)

// Get COGS by SKU
router.get(
  '/:sku',
  requirePermission('profit', 'read'),
  validateSKU,
  validateRequest,
  cogsController.getCOGSBySKU
)

// Create COGS
router.post(
  '/',
  requirePermission('profit', 'write'),
  ...validateCreateCOGS,
  validateRequest,
  cogsController.createCOGS
)

// Update COGS (requires admin/manager)
router.patch(
  '/:id',
  requirePermission('profit', 'write'),
  ...validateCOGSId,
  ...validateUpdateCOGS,
  validateRequest,
  cogsController.updateCOGS
)

// Get batch details
router.get(
  '/batch/:batchId',
  requirePermission('profit', 'read'),
  ...validateBatchId,
  validateRequest,
  cogsController.getBatchDetails
)

// Create batch
router.post(
  '/batch',
  requirePermission('profit', 'write'),
  ...validateCreateBatch,
  validateRequest,
  cogsController.createBatch
)

// Get historical COGS
router.get(
  '/history',
  requirePermission('profit', 'read'),
  ...validateCOGSHistorical,
  validateRequest,
  cogsController.getCOGSHistorical
)

export default router

