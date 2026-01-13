import { Router } from 'express'
import * as cashflowController from './cashflow.controller'
import { authenticate } from '../../middlewares/auth.middleware'

const router = Router()
router.use(authenticate)

router.get('/', cashflowController.getCashflow)
router.post('/', cashflowController.createCashflowEntry)

export default router

