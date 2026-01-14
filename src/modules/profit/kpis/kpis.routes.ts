import { Router } from 'express'
import * as kpisController from './kpis.controller'
import { authenticate } from '../../../middlewares/auth.middleware'
import { requirePermission } from '../../../middlewares/permission.middleware'

/**
 * KPIs routes
 * All routes require authentication and profit.read permission
 * 
 * Endpoints:
 * - GET /profit/kpis/units-sold - Get units sold KPI
 * - GET /profit/kpis/returns-cost - Get returns cost KPI
 * - GET /profit/kpis/advertising-cost - Get advertising cost (PPC) KPI
 * - GET /profit/kpis/fba-fees - Get FBA fees KPI
 * - GET /profit/kpis/payout-estimate - Get payout estimate KPI
 */

const router = Router()

// All KPI routes require authentication
router.use(authenticate)

// All KPI routes require profit.read permission
router.get(
  '/units-sold',
  requirePermission('profit', 'read'),
  kpisController.getUnitsSoldKPI
)
router.get(
  '/returns-cost',
  requirePermission('profit', 'read'),
  kpisController.getReturnsCostKPI
)
router.get(
  '/advertising-cost',
  requirePermission('profit', 'read'),
  kpisController.getAdvertisingCostKPI
)
router.get('/fba-fees', requirePermission('profit', 'read'), kpisController.getFBAFeesKPI)
router.get(
  '/payout-estimate',
  requirePermission('profit', 'read'),
  kpisController.getPayoutEstimateKPI
)

export default router

