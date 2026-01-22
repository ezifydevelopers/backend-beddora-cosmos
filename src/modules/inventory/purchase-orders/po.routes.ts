import { Router } from 'express'
import * as poController from './po.controller'
import { requirePermission } from '../../../middlewares/permission.middleware'
import { authenticate } from '../../../middlewares/auth.middleware'
import { validateRequest } from '../../../middlewares/validation.middleware'
import {
  validateCancelPO,
  validateCreatePO,
  validateDuplicatePO,
  validatePOId,
  validatePurchaseOrderFilters,
  validateUpdatePO,
} from './po.validation'

const router = Router()
router.use(authenticate)

router.get(
  '/',
  requirePermission('inventory', 'read'),
  ...validatePurchaseOrderFilters,
  validateRequest,
  poController.listPurchaseOrders
)

router.get(
  '/alerts',
  requirePermission('inventory', 'read'),
  ...validatePurchaseOrderFilters,
  validateRequest,
  poController.getPurchaseOrderAlerts
)

router.get(
  '/:id',
  requirePermission('inventory', 'read'),
  ...validatePOId,
  validateRequest,
  poController.getPurchaseOrder
)

router.post(
  '/',
  requirePermission('inventory', 'write'),
  ...validateCreatePO,
  validateRequest,
  poController.createPurchaseOrder
)

router.patch(
  '/:id',
  requirePermission('inventory', 'write'),
  ...validatePOId,
  ...validateUpdatePO,
  validateRequest,
  poController.updatePurchaseOrder
)

router.delete(
  '/:id',
  requirePermission('inventory', 'write'),
  ...validatePOId,
  ...validateCancelPO,
  validateRequest,
  poController.cancelPurchaseOrder
)

router.post(
  '/:id/duplicate',
  requirePermission('inventory', 'write'),
  ...validatePOId,
  ...validateDuplicatePO,
  validateRequest,
  poController.duplicatePurchaseOrder
)

export default router

