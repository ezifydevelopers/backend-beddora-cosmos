import { Router } from 'express'
import * as permissionsController from './permissions.controller'
import { authenticate } from '../../middlewares/auth.middleware'
import { requirePermission } from '../../middlewares/permission.middleware'

/**
 * Permissions routes
 */

const router = Router()

router.use(authenticate)

// Specific routes must come before parameterized routes
router.get('/me', permissionsController.getMyPermissions)
router.get('/roles', requirePermission('permissions', 'read'), permissionsController.listRoles)
router.post('/roles', requirePermission('permissions', 'write'), permissionsController.createRole)
router.post('/permissions', requirePermission('permissions', 'write'), permissionsController.createPermission)

// Parameterized routes come last
router.get('/:userId', requirePermission('permissions', 'read'), permissionsController.getUserPermissions)
router.patch('/:userId', requirePermission('permissions', 'write'), permissionsController.updateUserPermissions)

export default router
