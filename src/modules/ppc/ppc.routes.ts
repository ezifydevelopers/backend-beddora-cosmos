import { Router } from 'express'
import * as ppcController from './ppc.controller'
import { authenticate } from '../../middlewares/auth.middleware'

const router = Router()
router.use(authenticate)

router.get('/campaigns', ppcController.getCampaigns)
router.get('/campaigns/:id', ppcController.getCampaignById)
router.patch('/campaigns/:id', ppcController.updateCampaign)
router.get('/performance', ppcController.getPPCPerformance)

export default router

