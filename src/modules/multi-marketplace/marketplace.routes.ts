/**
 * Multi-Marketplace Routes
 */

import { Router } from 'express'
import { authenticate } from '../../middlewares/auth.middleware'
import { requirePermission } from '../../middlewares/permission.middleware'
import * as marketplaceController from './marketplace.controller'

const router = Router()

// Public supported marketplaces (already exposed via /marketplaces)
router.get('/marketplaces', marketplaceController.getSupportedMarketplaces)

router.use(authenticate)

router.get(
  '/users/:userId/marketplaces',
  requirePermission('accounts', 'read'),
  marketplaceController.getUserMarketplaces
)

router.post(
  '/users/:userId/marketplaces',
  requirePermission('accounts', 'write'),
  marketplaceController.linkUserMarketplace
)

router.patch(
  '/users/:userId/marketplaces/:id',
  requirePermission('accounts', 'write'),
  marketplaceController.updateUserMarketplace
)

router.delete(
  '/users/:userId/marketplaces/:id',
  requirePermission('accounts', 'write'),
  marketplaceController.unlinkUserMarketplace
)

export default router

