import { Router } from 'express'
import * as alertsController from './alerts.controller'
import { authenticate } from '../../middlewares/auth.middleware'
import listingChangeRoutes from './listing-change/listingChange.routes'
import buyBoxRoutes from './buy-box/buyBox.routes'
import feeChangeRoutes from './fee-change/feeChange.routes'
import feedbackReviewRoutes from './feedback-review/feedbackReview.routes'

const router = Router()
router.use(authenticate)

router.get('/', alertsController.getAlerts)
router.post('/', alertsController.createAlert)
router.patch('/:id/read', alertsController.markAlertAsRead)
router.use('/listing', listingChangeRoutes)
router.use('/buy-box', buyBoxRoutes)
router.use('/fees', feeChangeRoutes)
router.use('/feedback', feedbackReviewRoutes)

export default router

