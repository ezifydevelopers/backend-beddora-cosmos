/**
 * Reimbursement Case Routes
 */

import { Router } from 'express'
import { authenticate } from '../../../middlewares/auth.middleware'
import { requirePermission } from '../../../middlewares/permission.middleware'
import * as caseController from './case.controller'

const router = Router()
router.use(authenticate)

router.get('/', requirePermission('reimbursements', 'read'), caseController.getCases)
router.get('/seller-support', requirePermission('reimbursements', 'read'), caseController.getSellerSupportUrl)
router.get('/:id', requirePermission('reimbursements', 'read'), caseController.getCaseById)
router.post('/', requirePermission('reimbursements', 'write'), caseController.createCase)
router.patch('/:id', requirePermission('reimbursements', 'write'), caseController.updateCase)

export default router

