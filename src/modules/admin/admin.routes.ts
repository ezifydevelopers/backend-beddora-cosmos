import { Router } from 'express'
import * as adminController from './admin.controller'
import { authenticate } from '../../middlewares/auth.middleware'
import { requireRole } from '../../middlewares/role.middleware'

const router = Router()
router.use(authenticate)
router.use(requireRole('admin'))

router.get('/stats', adminController.getSystemStats)
router.get('/audit-logs', adminController.getAuditLogs)

export default router

