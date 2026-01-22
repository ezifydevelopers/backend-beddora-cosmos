import { Router } from 'express'
import { authenticate } from '../../../middlewares/auth.middleware'
import { requirePermission } from '../../../middlewares/permission.middleware'
import { validateRequest } from '../../../middlewares/validation.middleware'
import {
  validateApplyRecommendations,
  validateBulkBidUpdate,
  validateBulkHistory,
  validateBulkRevert,
  validateBulkStatusChange,
} from './bulk.validation'
import * as bulkController from './bulk.controller'

const router = Router()
router.use(authenticate)

router.post(
  '/bid-update',
  requirePermission('ppc', 'write'),
  ...validateBulkBidUpdate,
  validateRequest,
  bulkController.bulkBidUpdate
)

router.post(
  '/status-change',
  requirePermission('ppc', 'write'),
  ...validateBulkStatusChange,
  validateRequest,
  bulkController.bulkStatusChange
)

router.post(
  '/apply-recommendations',
  requirePermission('ppc', 'write'),
  ...validateApplyRecommendations,
  validateRequest,
  bulkController.applyRecommendations
)

router.get(
  '/history',
  requirePermission('ppc', 'read'),
  ...validateBulkHistory,
  validateRequest,
  bulkController.getBulkHistory
)

router.post(
  '/revert',
  requirePermission('ppc', 'write'),
  ...validateBulkRevert,
  validateRequest,
  bulkController.revertBulkAction
)

export default router

