import { Router } from 'express'
import { authenticate } from '../../../middlewares/auth.middleware'
import { requirePermission } from '../../../middlewares/permission.middleware'
import { validateRequest } from '../../../middlewares/validation.middleware'
import {
  validateListingAlertId,
  validateListingAlertsFilters,
  validateListingAsin,
} from './listingChange.validation'
import * as listingChangeController from './listingChange.controller'

const router = Router()
router.use(authenticate)

router.get(
  '/',
  requirePermission('alerts', 'read'),
  ...validateListingAlertsFilters,
  validateRequest,
  listingChangeController.getListingAlerts
)

router.get(
  '/:asin',
  requirePermission('alerts', 'read'),
  ...validateListingAsin,
  ...validateListingAlertsFilters,
  validateRequest,
  listingChangeController.getListingAlertsByAsin
)

router.patch(
  '/:id/read',
  requirePermission('alerts', 'write'),
  ...validateListingAlertId,
  validateRequest,
  listingChangeController.markAlertRead
)

router.patch(
  '/:id/resolve',
  requirePermission('alerts', 'write'),
  ...validateListingAlertId,
  validateRequest,
  listingChangeController.markAlertResolved
)

export default router

