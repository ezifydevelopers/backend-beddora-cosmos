import { Router } from 'express'
import * as stockController from './stock.controller'
import { requirePermission } from '../../../middlewares/permission.middleware'
import { validateRequest } from '../../../middlewares/validation.middleware'
import {
  validateInventoryAlerts,
  validateInventoryFilters,
  validateInventoryUpdate,
  validateSKUParam,
} from './stock.validation'

const router = Router()

router.get(
  '/',
  requirePermission('inventory', 'read'),
  ...validateInventoryFilters,
  validateRequest,
  stockController.getInventory
)

router.get(
  '/alerts',
  requirePermission('inventory', 'read'),
  ...validateInventoryAlerts,
  validateRequest,
  stockController.getLowStockAlerts
)

router.get(
  '/:sku',
  requirePermission('inventory', 'read'),
  ...validateSKUParam,
  validateRequest,
  stockController.getInventoryBySKU
)

router.patch(
  '/:sku',
  requirePermission('inventory', 'write'),
  ...validateSKUParam,
  ...validateInventoryUpdate,
  validateRequest,
  stockController.updateInventory
)

export default router

