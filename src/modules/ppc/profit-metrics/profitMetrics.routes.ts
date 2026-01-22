import { Router } from 'express'
import { authenticate } from '../../../middlewares/auth.middleware'
import { requirePermission } from '../../../middlewares/permission.middleware'
import { validateRequest } from '../../../middlewares/validation.middleware'
import { validateProfitMetricsFilters } from './profitMetrics.validation'
import * as profitMetricsController from './profitMetrics.controller'

const router = Router()
router.use(authenticate)

router.get(
  '/',
  requirePermission('ppc', 'read'),
  ...validateProfitMetricsFilters,
  validateRequest,
  profitMetricsController.getProfitOverview
)

router.get(
  '/campaigns',
  requirePermission('ppc', 'read'),
  ...validateProfitMetricsFilters,
  validateRequest,
  profitMetricsController.getCampaignProfit
)

router.get(
  '/ad-groups',
  requirePermission('ppc', 'read'),
  ...validateProfitMetricsFilters,
  validateRequest,
  profitMetricsController.getAdGroupProfit
)

router.get(
  '/keywords',
  requirePermission('ppc', 'read'),
  ...validateProfitMetricsFilters,
  validateRequest,
  profitMetricsController.getKeywordProfit
)

export default router

