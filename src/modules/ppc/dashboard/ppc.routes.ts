import { Router } from 'express'
import { authenticate } from '../../../middlewares/auth.middleware'
import { requirePermission } from '../../../middlewares/permission.middleware'
import { validateRequest } from '../../../middlewares/validation.middleware'
import { validatePpcFilters } from './ppc.validation'
import * as ppcController from './ppc.controller'

const router = Router()
router.use(authenticate)

router.get(
  '/',
  requirePermission('ppc', 'read'),
  ...validatePpcFilters,
  validateRequest,
  ppcController.getOverview
)

router.get(
  '/campaigns',
  requirePermission('ppc', 'read'),
  ...validatePpcFilters,
  validateRequest,
  ppcController.getCampaigns
)

router.get(
  '/ad-groups',
  requirePermission('ppc', 'read'),
  ...validatePpcFilters,
  validateRequest,
  ppcController.getAdGroups
)

router.get(
  '/keywords',
  requirePermission('ppc', 'read'),
  ...validatePpcFilters,
  validateRequest,
  ppcController.getKeywords
)

export default router

