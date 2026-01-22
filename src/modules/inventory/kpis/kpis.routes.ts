import { Router } from 'express'
import * as kpisController from './kpis.controller'
import { authenticate } from '../../../middlewares/auth.middleware'
import { requirePermission } from '../../../middlewares/permission.middleware'
import { validateRequest } from '../../../middlewares/validation.middleware'
import { validateInventoryKpiFilters, validateKpiRecalc, validateSkuParam } from './kpis.validation'

const router = Router()
router.use(authenticate)

router.get(
  '/',
  requirePermission('inventory', 'read'),
  ...validateInventoryKpiFilters,
  validateRequest,
  kpisController.getInventoryKpis
)

router.get(
  '/:sku',
  requirePermission('inventory', 'read'),
  ...validateSkuParam,
  ...validateInventoryKpiFilters,
  validateRequest,
  kpisController.getInventoryKpiBySKU
)

router.post(
  '/calculate',
  requirePermission('inventory', 'write'),
  ...validateKpiRecalc,
  validateRequest,
  kpisController.recalculateInventoryKpis
)

export default router

