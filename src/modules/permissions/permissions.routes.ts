import { Router } from 'express'
import * as permissionsController from './permissions.controller'
import { authenticate } from '../../middlewares/auth.middleware'
import { requirePermission } from '../../middlewares/permission.middleware'

/**
 * Permissions routes
 */

const router = Router()

router.use(authenticate)

router.get('/me', permissionsController.getMyPermissions)
router.patch('/:userId', requirePermission('permissions', 'write'), permissionsController.updateUserPermissions)

export default router
