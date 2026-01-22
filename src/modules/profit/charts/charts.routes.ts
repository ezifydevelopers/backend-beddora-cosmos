import { Router } from 'express'
import * as chartsController from './charts.controller'
import { authenticate } from '../../../middlewares/auth.middleware'
import { requirePermission } from '../../../middlewares/permission.middleware'
import { validateRequest } from '../../../middlewares/validation.middleware'
import { validateChartFilters, validateComparisonFilters } from './charts.validation'

const router = Router()

router.use(authenticate)

router.get(
  '/profit',
  requirePermission('profit', 'read'),
  ...validateChartFilters,
  validateRequest,
  chartsController.getProfitChart
)

router.get(
  '/sales',
  requirePermission('profit', 'read'),
  ...validateChartFilters,
  validateRequest,
  chartsController.getSalesChart
)

router.get(
  '/ppc',
  requirePermission('profit', 'read'),
  ...validateChartFilters,
  validateRequest,
  chartsController.getPpcChart
)

router.get(
  '/returns',
  requirePermission('profit', 'read'),
  ...validateChartFilters,
  validateRequest,
  chartsController.getReturnsChart
)

router.get(
  '/comparison',
  requirePermission('profit', 'read'),
  ...validateComparisonFilters,
  validateRequest,
  chartsController.getComparisonChart
)

router.get(
  '/dashboard',
  requirePermission('profit', 'read'),
  ...validateChartFilters,
  validateRequest,
  chartsController.getDashboardChart
)

export default router

