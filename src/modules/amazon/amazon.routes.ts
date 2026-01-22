import { Router } from 'express'
import { authenticate } from '../../middlewares/auth.middleware'
import { validate } from '../../middlewares/validation.middleware'
import * as amazonController from './amazon.controller'
import * as testController from './test.controller'
import * as sandboxController from './sandbox.controller'
import * as sandboxDiagnosticController from './sandbox-diagnostic.controller'
import * as oauthController from './oauth.controller'
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

export default router
