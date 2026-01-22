import { Router } from 'express'
import * as reimbursementsController from './reimbursements.controller'
import { authenticate } from '../../middlewares/auth.middleware'
import fbaInventoryRoutes from './fba-inventory/fbaInventory.routes'
import refundDiscrepancyRoutes from './refund-discrepancies/refundDiscrepancy.routes'
import caseRoutes from './case-generation/case.routes'

const router = Router()
router.use(authenticate)

// General reimbursements routes
router.get('/', reimbursementsController.getReimbursements)
router.post('/', reimbursementsController.createReimbursement)
router.patch('/:id/status', reimbursementsController.updateReimbursementStatus)

// FBA inventory alerts routes
router.use('/fba', fbaInventoryRoutes)
// Refund discrepancy routes
router.use('/refund-discrepancies', refundDiscrepancyRoutes)
// Case generation routes
router.use('/cases', caseRoutes)

export default router

