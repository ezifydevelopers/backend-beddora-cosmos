import { Router } from 'express'
import * as profitController from './profit.controller'
import kpisRoutes from './kpis/kpis.routes'
import { authenticate } from '../../middlewares/auth.middleware'
import { requirePermission } from '../../middlewares/permission.middleware'

/**
 * Profit routes
 * All routes require authentication and profit.read permission
 * 
 * Endpoints:
 * - GET /profit/summary - Get aggregated profit summary metrics
 * - GET /profit/by-product - Get profit breakdown by product/SKU
 * - GET /profit/by-marketplace - Get profit breakdown by marketplace
 * - GET /profit/trends - Get profit trends over time for charts
 * - GET /profit/report - Legacy endpoint (redirects to summary)
 * - /profit/kpis/* - KPI endpoints (see kpis.routes.ts)
 */

const router = Router()

// All profit routes require authentication
router.use(authenticate)

// All profit routes require profit.read permission
router.get('/summary', requirePermission('profit', 'read'), profitController.getProfitSummary)
router.get('/by-product', requirePermission('profit', 'read'), profitController.getProfitByProduct)
router.get(
  '/by-marketplace',
  requirePermission('profit', 'read'),
  profitController.getProfitByMarketplace
)
router.get('/trends', requirePermission('profit', 'read'), profitController.getProfitTrends)
router.get('/report', requirePermission('profit', 'read'), profitController.getProfitReport) // Legacy

// KPI routes
router.use('/kpis', kpisRoutes)

export default router

