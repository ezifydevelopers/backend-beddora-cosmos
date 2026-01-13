import { Router } from 'express'
import * as autoresponderController from './autoresponder.controller'
import { authenticate } from '../../middlewares/auth.middleware'

const router = Router()
router.use(authenticate)

router.get('/', autoresponderController.getAutoresponders)
router.post('/', autoresponderController.createAutoresponder)

export default router

