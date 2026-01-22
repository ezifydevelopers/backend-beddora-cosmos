import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import * as expensesController from './expenses.controller'
import { authenticate } from '../../../middlewares/auth.middleware'
import { requirePermission } from '../../../middlewares/permission.middleware'
import { validateRequest } from '../../../middlewares/validation.middleware'
import {
  validateExpenseFilters,
  validateCreateExpense,
  validateUpdateExpense,
  validateExpenseId,
  validateBulkImport,
} from './expenses.validation'

/**
 * Expenses routes
 * All routes require authentication
 * Write operations require profit.write permission
 */

const router = Router()

// Configure multer for file uploads (CSV/Excel)
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req, file, cb) => {
    const allowedExtensions = ['.csv', '.xlsx', '.xls']
    const ext = path.extname(file.originalname).toLowerCase()
    if (allowedExtensions.includes(ext)) {
      cb(null, true)
    } else {
      cb(new Error(`Invalid file type. Allowed types: ${allowedExtensions.join(', ')}`))
    }
  },
})

router.use(authenticate)

// GET /expenses - list expenses
router.get(
  '/',
  requirePermission('profit', 'read'),
  ...validateExpenseFilters,
  validateRequest,
  expensesController.getExpenses
)

// POST /expenses - create expense
router.post(
  '/',
  requirePermission('profit', 'write'),
  ...validateCreateExpense,
  validateRequest,
  expensesController.createExpense
)

// PATCH /expenses/:id - update expense
router.patch(
  '/:id',
  requirePermission('profit', 'write'),
  ...validateExpenseId,
  ...validateUpdateExpense,
  validateRequest,
  expensesController.updateExpense
)

// DELETE /expenses/:id - delete expense
router.delete(
  '/:id',
  requirePermission('profit', 'write'),
  ...validateExpenseId,
  validateRequest,
  expensesController.deleteExpense
)

// POST /expenses/bulk - bulk import
router.post(
  '/bulk',
  requirePermission('profit', 'write'),
  upload.single('file'),
  ...validateBulkImport,
  validateRequest,
  expensesController.bulkImportExpenses
)

export default router

