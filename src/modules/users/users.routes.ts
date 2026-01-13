import { Router } from 'express'
import * as usersController from './users.controller'
import { authenticate } from '../../middlewares/auth.middleware'

/**
 * Users routes
 */

const router = Router()

router.use(authenticate)

router.get('/me', usersController.getCurrentUser)
router.patch('/me', usersController.updateCurrentUser)
router.post('/me/change-password', usersController.changePassword)

export default router
