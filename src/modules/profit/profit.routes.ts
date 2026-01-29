import { Router } from 'express'
import * as profitController from './profit.controller'
import kpisRoutes from './kpis/kpis.routes'
import cogsRoutes from './cogs/cogs.routes'
import expensesRoutes from './expenses/expenses.routes'
import returnsRoutes from './returns/returns.routes'
import chartsRoutes from './charts/charts.routes'
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
 * - GET /profit/by-order-items - Get profit breakdown by order items
 * - GET /profit/trends - Get profit trends over time for charts
 * - GET /profit/pl - Get P&L (Profit & Loss) data grouped by periods
 * - GET /profit/map - Get profit breakdown by country for map visualization
 * - GET /profit/report - Legacy endpoint (redirects to summary)
 * - /profit/kpis/* - KPI endpoints (see kpis.routes.ts)
 */

const router = Router()

// All profit routes require authentication
router.use(authenticate)

// All profit routes require profit.read permission
router.get('/summary', requirePermission('profit', 'read'), profitController.getProfitSummary)
router.get('/summary/multiple-periods', requirePermission('profit', 'read'), profitController.getProfitSummaryMultiplePeriods)
router.get('/by-product', requirePermission('profit', 'read'), profitController.getProfitByProduct)
router.get(
  '/by-marketplace',
  requirePermission('profit', 'read'),
  profitController.getProfitByMarketplace
)
router.get('/by-order-items', requirePermission('profit', 'read'), profitController.getProfitByOrderItems)
router.get('/trends', requirePermission('profit', 'read'), profitController.getProfitTrends)
router.get('/trends/simple', requirePermission('profit', 'read'), profitController.getProfitTrendsSimple)
router.get('/trends/products', requirePermission('profit', 'read'), profitController.getProductTrends)
router.get('/pl', requirePermission('profit', 'read'), profitController.getPLByPeriods)
router.get('/map', requirePermission('profit', 'read'), profitController.getProfitByCountry)
router.get('/report', requirePermission('profit', 'read'), profitController.getProfitReport) // Legacy

// KPI routes
router.use('/kpis', kpisRoutes)

// COGS routes
router.use('/cogs', cogsRoutes)

// Expenses routes
router.use('/expenses', expensesRoutes)

// Returns routes
router.use('/returns', returnsRoutes)

// Charts routes
router.use('/charts', chartsRoutes)

export default router

