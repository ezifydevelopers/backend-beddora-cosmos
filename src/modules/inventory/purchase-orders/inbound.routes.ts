import { Router } from 'express'
import * as inboundController from './inbound.controller'
import { requirePermission } from '../../../middlewares/permission.middleware'
import { authenticate } from '../../../middlewares/auth.middleware'
import { validateRequest } from '../../../middlewares/validation.middleware'
import { validateInboundFilters, validateInboundId, validateInboundUpdate } from './inbound.validation'

const router = Router()
router.use(authenticate)

router.get(
  '/',
  requirePermission('inventory', 'read'),
  ...validateInboundFilters,
  validateRequest,
  inboundController.listInboundShipments
)

router.patch(
  '/:id',
  requirePermission('inventory', 'write'),
  ...validateInboundId,
  ...validateInboundUpdate,
  validateRequest,
  inboundController.updateInboundShipment
)

export default router

