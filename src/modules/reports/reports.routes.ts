import { Router } from 'express'
import * as reportsController from './reports.controller'
import { authenticate } from '../../middlewares/auth.middleware'

const router = Router()
router.use(authenticate)

router.get('/', reportsController.getReports)
router.post('/', reportsController.generateReport)
router.get('/:id', reportsController.getReportById)

export default router

