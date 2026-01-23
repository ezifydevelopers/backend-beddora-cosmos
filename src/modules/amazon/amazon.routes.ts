import { Router } from 'express'
import { authenticate } from '../../middlewares/auth.middleware'
import { validate } from '../../middlewares/validation.middleware'
import * as amazonController from './amazon.controller'
import * as testController from './test.controller'
import * as sandboxController from './sandbox.controller'
import * as sandboxDiagnosticController from './sandbox-diagnostic.controller'
import * as oauthController from './oauth.controller'
import * as webhookHandlers from './webhooks'
import * as syncStatusController from './sync-status.controller'
import * as productsController from './products.controller'
import * as inventoryController from './inventory.controller'
import * as errorRecoveryController from './error-recovery.controller'
import * as syncScheduleController from './sync-schedule.controller'
import { syncRequestSchema } from './amazon.validation'

/**
 * Amazon routes
 * 
 * All routes require authentication
 * Routes for syncing data from Amazon Selling Partner API
 * 
 * Architecture:
 * - Modular route structure
 * - Can be extracted to separate microservices in the future
 */

const router = Router()

// Webhook endpoints (NO authentication required - Amazon calls these directly)
// These endpoints receive real-time notifications from Amazon SP-API
// Security: Signature verification is handled by middleware
// IMPORTANT: Webhooks must be registered BEFORE authentication middleware
const webhookRouter = Router()
webhookRouter.use(webhookHandlers.verifyWebhookSignatureMiddleware)
webhookRouter.post('/orders', webhookHandlers.handleOrderNotification)
webhookRouter.post('/inventory', webhookHandlers.handleInventoryNotification)
webhookRouter.post('/listings', webhookHandlers.handleListingNotification)
webhookRouter.post('/token-rotation', webhookHandlers.handleTokenRotationNotification)

// Mount webhook router at /webhooks (no auth required)
router.use('/webhooks', webhookRouter)

// Apply authentication to all other routes
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

// Manual sync triggers and status endpoints (using BullMQ queue)
// POST /amazon/sync/trigger - Trigger a manual sync job
router.post('/sync/trigger', syncStatusController.triggerManualSync)
// GET /amazon/sync/status/:jobId - Get status of a specific sync job
router.get('/sync/status/:jobId', syncStatusController.getSyncJobStatus)
// GET /amazon/sync/status - Get sync status for an account (latest jobs)
router.get('/sync/status', syncStatusController.getAccountSyncStatus)
// GET /amazon/sync/queue-stats - Get queue statistics
router.get('/sync/queue-stats', syncStatusController.getQueueStatistics)
// DELETE /amazon/sync/cancel/:jobId - Cancel a sync job
router.delete('/sync/cancel/:jobId', syncStatusController.cancelSyncJob)

// Test endpoints (for verifying SP-API integration)
// These endpoints test the entire authentication chain:
// 1. Credential storage/retrieval
// 2. Token exchange (refresh token → access token)
// 3. IAM role assumption
// 4. SP-API authentication
router.get('/test/orders', testController.testOrdersAPI)
router.get('/test/status', testController.testStatus)

// Sandbox endpoints (for testing SP-API in sandbox mode)
// These endpoints use environment variables for credentials:
// - SANDBOX_APP_NAME
// - SANDBOX_APP_ID
// - SANDBOX_REFRESH_TOKEN
// - SANDBOX_CLIENT_SECRET (or AMAZON_SP_API_CLIENT_SECRET)
router.get('/sandbox/orders', sandboxController.getSandboxOrdersController)
router.get('/sandbox/test', sandboxController.testSandboxConnectionController)
router.get('/sandbox/diagnostic', sandboxDiagnosticController.sandboxDiagnosticController)

// OAuth endpoints (for connecting Amazon accounts via OAuth flow)
// These endpoints handle the OAuth 2.0 authorization flow:
// 1. Generate authorization URL with CSRF protection
// 2. Handle callback from Amazon with authorization code
// 3. Exchange code for refresh token and store credentials
router.get('/oauth/authorize', oauthController.generateAuthorizationUrl)
router.get('/oauth/callback', oauthController.handleOAuthCallback)
router.get('/oauth/status', oauthController.getOAuthStatus)

// Products API endpoints (for product catalog and pricing)
// GET /amazon/products/catalog - Get catalog items by ASINs
router.get('/products/catalog', productsController.getCatalogItems)
// GET /amazon/products/search - Search catalog items by keywords
router.get('/products/search', productsController.searchCatalogItems)
// GET /amazon/products/pricing - Get product pricing by ASINs or SKUs
router.get('/products/pricing', productsController.getProductPricing)
// GET /amazon/products/eligibility - Check product eligibility for programs
router.get('/products/eligibility', productsController.getProductEligibility)
// POST /amazon/products/parse - Parse product data from catalog item
router.post('/products/parse', productsController.parseProductData)

// Inventory API endpoints (for FBA inventory with detailed metrics)
// GET /amazon/inventory/summaries - Get inventory summaries
router.get('/inventory/summaries', inventoryController.getInventorySummaries)
// GET /amazon/inventory/items - Get detailed inventory items
router.get('/inventory/items', inventoryController.getInventoryItems)
// GET /amazon/inventory/health - Get inventory health metrics with detailed FBA metrics
router.get('/inventory/health', inventoryController.getInventoryHealth)
// GET /amazon/inventory/sku/:sku - Get inventory by SKU with enhanced metrics
router.get('/inventory/sku/:sku', inventoryController.getInventoryBySKU)
// POST /amazon/inventory/parse - Parse inventory summary to structured format
router.post('/inventory/parse', inventoryController.parseInventorySummary)

// Error Recovery endpoints (for managing failed sync jobs)
// POST /amazon/error-recovery/retry/:jobId - Retry a specific failed job
router.post('/error-recovery/retry/:jobId', errorRecoveryController.retryJob)
// GET /amazon/error-recovery/retryable - Get list of retryable failed jobs
router.get('/error-recovery/retryable', errorRecoveryController.getRetryableJobs)
// GET /amazon/error-recovery/permanent - Get list of permanently failed jobs (dead letter queue)
router.get('/error-recovery/permanent', errorRecoveryController.getPermanentFailedJobs)
// POST /amazon/error-recovery/bulk-retry - Bulk retry multiple failed jobs
router.post('/error-recovery/bulk-retry', errorRecoveryController.bulkRetryJobs)
// GET /amazon/error-recovery/statistics - Get retry statistics
router.get('/error-recovery/statistics', errorRecoveryController.getStatistics)
// POST /amazon/error-recovery/classify-error - Classify an error to determine retry strategy
router.post('/error-recovery/classify-error', errorRecoveryController.classifyErrorEndpoint)

// Sync Schedule endpoints
// GET /amazon/sync-schedule/:amazonAccountId - Get sync schedule for an account
router.get('/sync-schedule/:amazonAccountId', syncScheduleController.getSyncSchedule)
// PUT /amazon/sync-schedule/:amazonAccountId/:syncType - Update sync schedule for a specific sync type
router.put('/sync-schedule/:amazonAccountId/:syncType', syncScheduleController.updateSyncSchedule)
// PUT /amazon/sync-schedule/:amazonAccountId - Update multiple sync schedules at once
router.put('/sync-schedule/:amazonAccountId', syncScheduleController.updateSyncSchedules)

export default router
