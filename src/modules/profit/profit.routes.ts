import { Router } from 'express'
import * as profitController from './profit.controller'
import { authenticate } from '../../middlewares/auth.middleware'
import { requirePermission } from '../../middlewares/permission.middleware'

/**
 * Profit routes
 * All routes require authentication and profit.read permission
 * 
 * Example of permission-based route protection
 */

const router = Router()

// All profit routes require authentication
router.use(authenticate)

// All profit routes require profit.read permission
router.get('/report', requirePermission('profit', 'read'), profitController.getProfitReport)
router.get('/trends', requirePermission('profit', 'read'), profitController.getProfitTrends)
router.get('/summary', requirePermission('profit', 'read'), profitController.getProfitSummary)

export default router

