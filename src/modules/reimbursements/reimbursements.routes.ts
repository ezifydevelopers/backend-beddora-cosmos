import { Router } from 'express'
import * as reimbursementsController from './reimbursements.controller'
import { authenticate } from '../../middlewares/auth.middleware'

const router = Router()
router.use(authenticate)

router.get('/', reimbursementsController.getReimbursements)
router.post('/', reimbursementsController.createReimbursement)
router.patch('/:id/status', reimbursementsController.updateReimbursementStatus)

export default router

