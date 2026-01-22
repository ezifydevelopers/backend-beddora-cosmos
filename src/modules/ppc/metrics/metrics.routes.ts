import { Router } from 'express'
import { authenticate } from '../../../middlewares/auth.middleware'
import { requirePermission } from '../../../middlewares/permission.middleware'
import { validateRequest } from '../../../middlewares/validation.middleware'
import { validatePpcMetricsFilters } from './metrics.validation'
import * as metricsController from './metrics.controller'

const router = Router()
router.use(authenticate)

router.get(
  '/',
  requirePermission('ppc', 'read'),
  ...validatePpcMetricsFilters,
  validateRequest,
  metricsController.getOverview
)

router.get(
  '/campaigns',
  requirePermission('ppc', 'read'),
  ...validatePpcMetricsFilters,
  validateRequest,
  metricsController.getCampaignMetrics
)

router.get(
  '/ad-groups',
  requirePermission('ppc', 'read'),
  ...validatePpcMetricsFilters,
  validateRequest,
  metricsController.getAdGroupMetrics
)

router.get(
  '/keywords',
  requirePermission('ppc', 'read'),
  ...validatePpcMetricsFilters,
  validateRequest,
  metricsController.getKeywordMetrics
)

export default router

