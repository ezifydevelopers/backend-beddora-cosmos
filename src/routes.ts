import { Router } from 'express'

// Import all route modules
import authRoutes from './modules/auth/auth.routes'
import usersRoutes from './modules/users/users.routes'
import accountsRoutes from './modules/accounts/accounts.routes'
import permissionsRoutes from './modules/permissions/permissions.routes'
import marketplacesRoutes from './modules/marketplaces/marketplaces.routes'
import profitRoutes from './modules/profit/profit.routes'
import inventoryRoutes from './modules/inventory/inventory.routes'
import expensesRoutes from './modules/expenses/expenses.routes'
import cashflowRoutes from './modules/cashflow/cashflow.routes'
import ppcRoutes from './modules/ppc/ppc.routes'
import alertsRoutes from './modules/alerts/alerts.routes'
import autoresponderRoutes from './modules/autoresponder/autoresponder.routes'
import reimbursementsRoutes from './modules/reimbursements/reimbursements.routes'
import reportsRoutes from './modules/reports/reports.routes'
import adminRoutes from './modules/admin/admin.routes'
import amazonRoutes from './modules/amazon/amazon.routes'
import manualImportRoutes from './modules/manual-import/import.routes'
import cogsRoutes from './modules/profit/cogs/cogs.routes'

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

  // Authentication routes
  router.use('/auth', authRoutes)

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

  // COGS routes (profit dependency)
  router.use('/cogs', cogsRoutes)

  // Inventory routes
  router.use('/inventory', inventoryRoutes)

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

  return router
}

