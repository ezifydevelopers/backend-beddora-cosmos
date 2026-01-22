import { Router } from 'express'
import { authenticate } from '../../../middlewares/auth.middleware'
import { requirePermission } from '../../../middlewares/permission.middleware'
import { validateRequest } from '../../../middlewares/validation.middleware'
import {
  validateFeedbackAlertId,
  validateFeedbackAlertsFilters,
  validateFeedbackAsin,
} from './feedbackReview.validation'
import * as feedbackController from './feedbackReview.controller'

const router = Router()
router.use(authenticate)

router.get(
  '/',
  requirePermission('alerts', 'read'),
  ...validateFeedbackAlertsFilters,
  validateRequest,
  feedbackController.getFeedbackAlerts
)

router.get(
  '/:asin',
  requirePermission('alerts', 'read'),
  ...validateFeedbackAsin,
  ...validateFeedbackAlertsFilters,
  validateRequest,
  feedbackController.getFeedbackAlertsByAsin
)

router.patch(
  '/:id/read',
  requirePermission('alerts', 'write'),
  ...validateFeedbackAlertId,
  validateRequest,
  feedbackController.markFeedbackAlertRead
)

router.patch(
  '/:id/resolve',
  requirePermission('alerts', 'write'),
  ...validateFeedbackAlertId,
  validateRequest,
  feedbackController.markFeedbackAlertResolved
)

export default router

