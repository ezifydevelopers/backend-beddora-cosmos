import { Router } from 'express'
import * as accountsController from './accounts.controller'
import { authenticate } from '../../middlewares/auth.middleware'
import { validate } from '../../middlewares/validation.middleware'
import {
  linkAmazonAccountSchema,
  updateAmazonAccountSchema,
  createAccountSchema,
  switchAccountSchema,
} from './accounts.validation'

/**
 * Accounts routes
 * 
 * All routes require authentication
 * Routes are organized by resource:
 * - Internal accounts (Account model)
 * - Amazon accounts (AmazonAccount model)
 */

const router = Router()

// Apply authentication to all routes
router.use(authenticate)

// ============================================
// INTERNAL ACCOUNT ROUTES
// ============================================

/**
 * GET /accounts
 * List all accounts for the logged-in user
 */
router.get('/', accountsController.getAccounts)

/**
 * POST /accounts
 * Create a new account
 */
router.post('/', validate(createAccountSchema), accountsController.createAccount)

/**
 * POST /accounts/switch
 * Switch active account
 */
router.post('/switch', validate(switchAccountSchema), accountsController.switchAccount)

/**
 * GET /accounts/:id/marketplaces
 * Get marketplaces for a specific account
 */
router.get('/:id/marketplaces', accountsController.getAccountMarketplaces)

// ============================================
// AMAZON ACCOUNT ROUTES
// ============================================

/**
 * GET /accounts
 * List all linked Amazon accounts for the logged-in user
 * 
 * Note: This conflicts with the internal accounts GET route above.
 * In a production system, consider using:
 * - GET /accounts/amazon for Amazon accounts
 * - GET /accounts/internal for internal accounts
 * 
 * For now, we'll use the legacy /linked endpoint for Amazon accounts
 * and keep /accounts for internal accounts.
 */
// router.get('/', accountsController.getAmazonAccounts) // Commented due to route conflict

/**
 * POST /accounts
 * Link a new Amazon Seller Central account
 * 
 * Body: { marketplace, sellerId, accessKey, secretKey, refreshToken }
 */
router.post('/link', validate(linkAmazonAccountSchema), accountsController.linkAmazonAccount)

/**
 * PATCH /accounts/:id
 * Update Amazon account credentials
 * 
 * Body: { sellerId?, accessKey?, secretKey?, refreshToken?, isActive? }
 */
router.patch('/:id', validate(updateAmazonAccountSchema), accountsController.updateAmazonAccount)

/**
 * DELETE /accounts/:id
 * Remove (unlink) an Amazon account
 */
router.delete('/:id', accountsController.deleteAmazonAccount)

/**
 * POST /accounts/switch/:id
 * Set the current active Amazon account in session
 */
router.post('/switch/:id', accountsController.switchAmazonAccount)

// ============================================
// LEGACY ROUTES (for backward compatibility)
// ============================================

/**
 * GET /accounts/linked
 * Get linked Amazon accounts (legacy endpoint)
 * 
 * @deprecated Use GET /accounts/amazon instead (when implemented)
 */
router.get('/linked', accountsController.getLinkedAccounts)

/**
 * DELETE /accounts/linked/:id
 * Delete linked Amazon account (legacy endpoint)
 * 
 * @deprecated Use DELETE /accounts/:id instead
 */
router.delete('/linked/:id', accountsController.deleteLinkedAccount)

export default router
