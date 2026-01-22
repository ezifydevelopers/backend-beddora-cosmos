import { Router } from 'express'
import { authenticate } from '../../middlewares/auth.middleware'
import { requirePermission } from '../../middlewares/permission.middleware'
import * as dashboardController from './dashboard.controller'

const router = Router()

router.use(authenticate)

router.get(
  '/summary',
  requirePermission('profit', 'read'), // Using profit permission as dashboard shows profit data
  dashboardController.getDashboardSummary
)

export default router

