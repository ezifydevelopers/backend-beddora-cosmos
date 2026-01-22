import { Router } from 'express'
import { authenticate } from '../../../middlewares/auth.middleware'
import { requirePermission } from '../../../middlewares/permission.middleware'
import { validateRequest } from '../../../middlewares/validation.middleware'
import {
  validateSendEmail,
  validateTemplateCreate,
  validateTemplateDelete,
  validateTemplateUpdate,
} from './email.validation'
import * as emailController from './email.controller'

const router = Router()
router.use(authenticate)

router.get('/templates', requirePermission('alerts', 'read'), emailController.getTemplates)
router.post(
  '/templates',
  requirePermission('alerts', 'write'),
  ...validateTemplateCreate,
  validateRequest,
  emailController.createTemplate
)
router.patch(
  '/templates/:id',
  requirePermission('alerts', 'write'),
  ...validateTemplateUpdate,
  validateRequest,
  emailController.updateTemplate
)
router.delete(
  '/templates/:id',
  requirePermission('alerts', 'write'),
  ...validateTemplateDelete,
  validateRequest,
  emailController.deleteTemplate
)
router.post(
  '/send',
  requirePermission('alerts', 'write'),
  ...validateSendEmail,
  validateRequest,
  emailController.sendEmailNow
)
router.get('/queue', requirePermission('alerts', 'read'), emailController.getEmailQueue)
router.get('/statistics', requirePermission('alerts', 'read'), emailController.getEmailStats)

export default router

