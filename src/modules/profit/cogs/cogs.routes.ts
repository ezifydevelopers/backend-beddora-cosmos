import { Router } from 'express'
import { authenticate } from '../../../middlewares/auth.middleware'
import { requirePermission } from '../../../middlewares/permission.middleware'
import { requireRoles } from '../../../middlewares/role.middleware'
import { validate } from '../../../middlewares/validation.middleware'
import * as cogsController from './cogs.controller'
import { createCogsSchema, updateCogsSchema } from './cogs.validation'

/**
 * COGS Routes (mounted at /cogs)
 *
 * Endpoints:
 * - GET    /cogs/:sku
 * - POST   /cogs
 * - PATCH  /cogs/:id
 * - GET    /cogs/batch/:batchId
 * - GET    /cogs/history
 */
const router = Router()

router.use(authenticate)

// Read endpoints
router.get('/history', requirePermission('profit', 'read'), cogsController.getHistory)
router.get('/batch/:batchId', requirePermission('profit', 'read'), cogsController.getBatchDetails)
router.get('/:sku', requirePermission('profit', 'read'), cogsController.getCogsForSku)

// Write endpoints (role-guarded edits)
router.post(
  '/',
  requirePermission('profit', 'write'),
  requireRoles(['ADMIN', 'MANAGER']),
  validate(createCogsSchema),
  cogsController.createCogs
)
router.patch(
  '/:id',
  requirePermission('profit', 'write'),
  requireRoles(['ADMIN', 'MANAGER']),
  validate(updateCogsSchema),
  cogsController.updateCogs
)

export default router

