import { Router } from 'express'

// Import all route modules
import authRoutes from './modules/auth/auth.routes'
import usersRoutes from './modules/users/users.routes'
import multiMarketplaceRoutes from './modules/multi-marketplace/marketplace.routes'
import accountsRoutes from './modules/accounts/accounts.routes'
import permissionsRoutes from './modules/permissions/permissions.routes'
import marketplacesRoutes from './modules/marketplaces/marketplaces.routes'
import profitRoutes from './modules/profit/profit.routes'
import inventoryRoutes from './modules/inventory/inventory.routes'
import purchaseOrderRoutes from './modules/inventory/purchase-orders/po.routes'
import inboundShipmentRoutes from './modules/inventory/purchase-orders/inbound.routes'
import expensesRoutes from './modules/expenses/expenses.routes'
import cashflowRoutes from './modules/cashflow/cashflow.routes'
import ppcRoutes from './modules/ppc/ppc.routes'
import alertsRoutes from './modules/alerts/alerts.routes'
import autoresponderRoutes from './modules/autoresponder/autoresponder.routes'
import emailRoutes from './modules/autoresponder/emails/email.routes'
import schedulingRulesRoutes from './modules/autoresponder/scheduling-rules/schedulingRule.routes'
import trackingStatsRoutes from './modules/autoresponder/tracking-stats/tracking.routes'
import reimbursementsRoutes from './modules/reimbursements/reimbursements.routes'
import reportsRoutes from './modules/reports/reports.routes'
import adminRoutes from './modules/admin/admin.routes'
import amazonRoutes from './modules/amazon/amazon.routes'
import manualImportRoutes from './modules/manual-import/import.routes'
import dashboardRoutes from './modules/dashboard/dashboard.routes'
import currencyRoutes from './modules/multi-currency/currency.routes'

/**
 * Central route registration
 * Registers all module routes
 * 
 * Future microservice separation:
 * - Each module can be extracted to its own service
 * - Use API gateway to route requests
 * - Keep this file as a reference for route structure
 */
export function registerRoutes(): Router {
  const router = Router()

  // Dashboard routes
  router.use('/dashboard', dashboardRoutes)

  // Authentication routes
  router.use('/auth', authRoutes)

  // Multi-marketplace routes (user-linked marketplaces)
  router.use('/', multiMarketplaceRoutes)

  // User management routes
  router.use('/users', usersRoutes)

  // Account management routes
  router.use('/accounts', accountsRoutes)

  // Permissions routes
  router.use('/permissions', permissionsRoutes)

  // Marketplace routes
  router.use('/marketplaces', marketplacesRoutes)

  // Profit routes
  router.use('/profit', profitRoutes)

  // Inventory routes
  router.use('/inventory', inventoryRoutes)
  router.use('/purchase-orders', purchaseOrderRoutes)
  router.use('/inbound-shipments', inboundShipmentRoutes)

  // Expenses routes
  router.use('/expenses', expensesRoutes)

  // Cashflow routes
  router.use('/cashflow', cashflowRoutes)

  // PPC routes
  router.use('/ppc', ppcRoutes)

  // Alerts routes
  router.use('/alerts', alertsRoutes)

  // Autoresponder routes
  router.use('/autoresponder', autoresponderRoutes)
  router.use('/emails', emailRoutes)
  router.use('/scheduling-rules', schedulingRulesRoutes)
  router.use('/tracking', trackingStatsRoutes)

  // Reimbursements routes
  router.use('/reimbursements', reimbursementsRoutes)

  // Reports routes
  router.use('/reports', reportsRoutes)

  // Admin routes
  router.use('/admin', adminRoutes)

  // Amazon SP API routes
  router.use('/amazon', amazonRoutes)

  // Manual import routes
  router.use('/import', manualImportRoutes)

  // Multi-currency routes
  router.use('/currencies', currencyRoutes)

  return router
}

