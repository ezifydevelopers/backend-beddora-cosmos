import { Router } from 'express'
import { authenticate } from '../../../middlewares/auth.middleware'
import { requirePermission } from '../../../middlewares/permission.middleware'
import { validateRequest } from '../../../middlewares/validation.middleware'
import {
  validateBuyBoxAlertId,
  validateBuyBoxAlertsFilters,
  validateBuyBoxAsin,
} from './buyBox.validation'
import * as buyBoxController from './buyBox.controller'

const router = Router()
router.use(authenticate)

router.get(
  '/',
  requirePermission('alerts', 'read'),
  ...validateBuyBoxAlertsFilters,
  validateRequest,
  buyBoxController.getBuyBoxAlerts
)

router.get(
  '/:asin',
  requirePermission('alerts', 'read'),
  ...validateBuyBoxAsin,
  ...validateBuyBoxAlertsFilters,
  validateRequest,
  buyBoxController.getBuyBoxAlertsByAsin
)

router.patch(
  '/:id/read',
  requirePermission('alerts', 'write'),
  ...validateBuyBoxAlertId,
  validateRequest,
  buyBoxController.markBuyBoxAlertRead
)

router.patch(
  '/:id/resolve',
  requirePermission('alerts', 'write'),
  ...validateBuyBoxAlertId,
  validateRequest,
  buyBoxController.markBuyBoxAlertResolved
)

export default router

