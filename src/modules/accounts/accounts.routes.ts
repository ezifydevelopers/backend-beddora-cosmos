import { Router } from 'express'
import * as accountsController from './accounts.controller'
import { authenticate } from '../../middlewares/auth.middleware'

/**
 * Accounts routes
 */

const router = Router()

router.use(authenticate)

router.get('/', accountsController.getAccounts)
router.post('/', accountsController.createAccount)
router.post('/switch', accountsController.switchAccount)
router.get('/:id/marketplaces', accountsController.getAccountMarketplaces)

export default router
