import { Router } from 'express'
import { authenticate } from '../../../middlewares/auth.middleware'
import { requirePermission } from '../../../middlewares/permission.middleware'
import { validateRequest } from '../../../middlewares/validation.middleware'
import {
  validateManualBidUpdate,
  validateOptimizationFilters,
  validateOptimizationHistory,
  validateOptimizationRun,
} from './optimization.validation'
import * as optimizationController from './optimization.controller'

const router = Router()
router.use(authenticate)

router.get(
  '/',
  requirePermission('ppc', 'read'),
  ...validateOptimizationFilters,
  validateRequest,
  optimizationController.getOptimizationStatus
)

router.post(
  '/run',
  requirePermission('ppc', 'write'),
  ...validateOptimizationRun,
  validateRequest,
  optimizationController.runOptimization
)

router.patch(
  '/:keywordId',
  requirePermission('ppc', 'write'),
  ...validateManualBidUpdate,
  validateRequest,
  optimizationController.updateKeywordBid
)

router.get(
  '/history',
  requirePermission('ppc', 'read'),
  ...validateOptimizationHistory,
  validateRequest,
  optimizationController.getOptimizationHistory
)

export default router

