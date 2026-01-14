import { Router } from 'express'
import { authenticate } from '../../middlewares/auth.middleware'
import { validate } from '../../middlewares/validation.middleware'
import * as importController from './import.controller'
import {
  uploadFileSchema,
  approveRejectSchema,
  finalizeSchema,
} from './import.validation'

/**
 * Manual Import Routes
 * 
 * All routes require authentication
 * Routes for manual data import via CSV/Excel files
 */

const router = Router()

// Apply authentication to all routes
router.use(authenticate)

// Upload endpoint (uses multer middleware)
router.post(
  '/upload',
  importController.uploadMiddleware,
  validate(uploadFileSchema),
  importController.uploadFile
)

// Get staging rows
router.get('/:type/staging', importController.getStagingRows)

// Approve rows
router.patch(
  '/:type/approve',
  validate(approveRejectSchema),
  importController.approveRows
)

// Reject rows
router.patch(
  '/:type/reject',
  validate(approveRejectSchema),
  importController.rejectRows
)

// Finalize import
router.post(
  '/:type/finalize',
  validate(finalizeSchema),
  importController.finalizeImport
)

export default router

