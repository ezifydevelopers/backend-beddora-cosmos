import { Router } from 'express'
import * as reportsController from './reports.controller'
import { authenticate } from '../../middlewares/auth.middleware'
import { requirePermission } from '../../middlewares/permission.middleware'
import { validateRequest } from '../../middlewares/validation.middleware'
import {
  validateExportReport,
  validateScheduleCreate,
  validateScheduleUpdate,
  validateScheduleId,
  validateListSchedules,
} from './reports.validation'

const router = Router()
router.use(authenticate)

router.get(
  '/export',
  requirePermission('profit', 'read'),
  ...validateExportReport,
  validateRequest,
  reportsController.exportReport
)

router.get(
  '/schedules',
  requirePermission('profit', 'read'),
  ...validateListSchedules,
  validateRequest,
  reportsController.listSchedules
)

router.post(
  '/schedule',
  requirePermission('profit', 'write'),
  ...validateScheduleCreate,
  validateRequest,
  reportsController.createSchedule
)

router.patch(
  '/schedule/:id',
  requirePermission('profit', 'write'),
  ...validateScheduleUpdate,
  validateRequest,
  reportsController.updateSchedule
)

router.delete(
  '/schedule/:id',
  requirePermission('profit', 'write'),
  ...validateScheduleId,
  validateRequest,
  reportsController.deleteSchedule
)

export default router

