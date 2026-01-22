import { Router } from 'express'
import * as returnsController from './returns.controller'
import { authenticate } from '../../../middlewares/auth.middleware'
import { requirePermission } from '../../../middlewares/permission.middleware'
import { validateRequest } from '../../../middlewares/validation.middleware'
import {
  validateReturnId,
  validateReturnFilters,
  validateCreateReturn,
  validateUpdateReturn,
} from './returns.validation'

/**
 * Returns routes
 * All routes require authentication
 * Write operations require profit.write permission
 */

const router = Router()

router.use(authenticate)

router.get(
  '/',
  requirePermission('profit', 'read'),
  ...validateReturnFilters,
  validateRequest,
  returnsController.getReturns
)

router.post(
  '/',
  requirePermission('profit', 'write'),
  ...validateCreateReturn,
  validateRequest,
  returnsController.createReturn
)

router.patch(
  '/:id',
  requirePermission('profit', 'write'),
  ...validateReturnId,
  ...validateUpdateReturn,
  validateRequest,
  returnsController.updateReturn
)

router.delete(
  '/:id',
  requirePermission('profit', 'write'),
  ...validateReturnId,
  validateRequest,
  returnsController.deleteReturn
)

router.get(
  '/summary',
  requirePermission('profit', 'read'),
  ...validateReturnFilters,
  validateRequest,
  returnsController.getReturnsSummary
)

export default router

