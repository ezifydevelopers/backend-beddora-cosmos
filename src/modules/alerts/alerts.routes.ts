import { Router } from 'express'
import * as alertsController from './alerts.controller'
import { authenticate } from '../../middlewares/auth.middleware'

const router = Router()
router.use(authenticate)

router.get('/', alertsController.getAlerts)
router.post('/', alertsController.createAlert)
router.patch('/:id/read', alertsController.markAlertAsRead)

export default router

