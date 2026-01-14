import { Router } from 'express'
import { authenticate } from '../../middlewares/auth.middleware'
import { validate } from '../../middlewares/validation.middleware'
import * as amazonController from './amazon.controller'
import { syncRequestSchema } from './amazon.validation'

/**
 * Amazon routes
 * 
 * All routes require authentication
 * Routes for syncing data from Amazon Selling Partner API
 */

const router = Router()

// Apply authentication to all routes
router.use(authenticate)

// Sync endpoints
router.post('/sync-orders', validate(syncRequestSchema), amazonController.syncOrders)
router.post('/sync-fees', validate(syncRequestSchema), amazonController.syncFees)
router.post('/sync-ppc', validate(syncRequestSchema), amazonController.syncPPC)
router.post('/sync-inventory', validate(syncRequestSchema), amazonController.syncInventory)
router.post('/sync-listings', validate(syncRequestSchema), amazonController.syncListings)
router.post('/sync-refunds', validate(syncRequestSchema), amazonController.syncRefunds)

// Sync logs endpoint
router.get('/sync-logs', amazonController.getSyncLogs)

export default router
