import { Router } from 'express'
import { authenticate } from '../../../middlewares/auth.middleware'
import { requirePermission } from '../../../middlewares/permission.middleware'
import { validateRequest } from '../../../middlewares/validation.middleware'
import {
  validateFeeChangeAlertId,
  validateFeeChangeAlertsFilters,
  validateFeeChangeMarketplace,
} from './feeChange.validation'
import * as feeChangeController from './feeChange.controller'

const router = Router()
router.use(authenticate)

router.get(
  '/',
  requirePermission('alerts', 'read'),
  ...validateFeeChangeAlertsFilters,
  validateRequest,
  feeChangeController.getFeeChangeAlerts
)

router.get(
  '/:marketplaceId',
  requirePermission('alerts', 'read'),
  ...validateFeeChangeMarketplace,
  ...validateFeeChangeAlertsFilters,
  validateRequest,
  feeChangeController.getFeeChangeAlertsByMarketplace
)

router.patch(
  '/:id/read',
  requirePermission('alerts', 'write'),
  ...validateFeeChangeAlertId,
  validateRequest,
  feeChangeController.markFeeChangeAlertRead
)

router.patch(
  '/:id/resolve',
  requirePermission('alerts', 'write'),
  ...validateFeeChangeAlertId,
  validateRequest,
  feeChangeController.markFeeChangeAlertResolved
)

export default router

