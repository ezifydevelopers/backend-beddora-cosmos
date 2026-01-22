/**
 * Multi-Currency Routes
 */

import { Router } from 'express'
import { authenticate } from '../../middlewares/auth.middleware'
import { requireRole } from '../../middlewares/role.middleware'
import * as currencyController from './currency.controller'

const router = Router()
router.use(authenticate)

// Read-only endpoints (any authenticated user)
router.get('/', currencyController.getCurrencies)
router.get('/exchange-rate', currencyController.getExchangeRate)

// Update rates (admin only)
router.post('/update-rates', requireRole('ADMIN'), currencyController.updateRates)

export default router

