import { Router } from 'express'
import * as forecastController from './forecast.controller'
import { requirePermission } from '../../../middlewares/permission.middleware'
import { validateRequest } from '../../../middlewares/validation.middleware'
import { validateForecastFilters, validateForecastUpdate, validateSKUParam } from './forecast.validation'

const router = Router()

router.get(
  '/',
  requirePermission('inventory', 'read'),
  ...validateForecastFilters,
  validateRequest,
  forecastController.getForecasts
)

router.get(
  '/alerts',
  requirePermission('inventory', 'read'),
  ...validateForecastFilters,
  validateRequest,
  forecastController.getRestockAlerts
)

router.get(
  '/:sku',
  requirePermission('inventory', 'read'),
  ...validateSKUParam,
  ...validateForecastFilters,
  validateRequest,
  forecastController.getForecastBySKU
)

router.patch(
  '/:sku',
  requirePermission('inventory', 'write'),
  ...validateSKUParam,
  ...validateForecastUpdate,
  validateRequest,
  forecastController.updateForecast
)

export default router

