import { body, param, query } from 'express-validator'

/**
 * Expense validation rules
 * Used with express-validator middleware
 */

export const validateExpenseId = [
  param('id')
    .isUUID()
    .withMessage('Invalid expense ID format'),
]

export const validateExpenseFilters = [
  query('accountId')
    .optional()
    .isUUID()
    .withMessage('Invalid account ID format'),
  query('marketplaceId')
    .optional()
    .isUUID()
    .withMessage('Invalid marketplace ID format'),
  query('type')
    .optional()
    .isIn(['fixed', 'recurring', 'one-time'])
    .withMessage('Invalid expense type'),
  query('category')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Invalid category'),
  query('sku')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Invalid SKU'),
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid startDate format'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid endDate format'),
]

export const validateCreateExpense = [
  body('accountId')
    .isUUID()
    .withMessage('Invalid account ID format'),
  body('marketplaceId')
    .optional()
    .isUUID()
    .withMessage('Invalid marketplace ID format'),
  body('type')
    .isIn(['fixed', 'recurring', 'one-time'])
    .withMessage('Invalid expense type'),
  body('category')
    .trim()
    .notEmpty()
    .withMessage('Category is required')
    .isLength({ min: 1, max: 100 })
    .withMessage('Category must be between 1 and 100 characters'),
  body('amount')
    .isFloat({ gt: 0 })
    .withMessage('Amount must be greater than 0'),
  body('currency')
    .trim()
    .notEmpty()
    .withMessage('Currency is required')
    .isLength({ min: 3, max: 10 })
    .withMessage('Currency must be between 3 and 10 characters'),
  body('allocatedProducts')
    .optional()
    .isArray()
    .withMessage('allocatedProducts must be an array'),
  body('allocatedProducts.*.sku')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('allocatedProducts sku is required'),
  body('allocatedProducts.*.percentage')
    .optional()
    .isFloat({ gt: 0, lte: 100 })
    .withMessage('allocatedProducts percentage must be between 0 and 100'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description must be less than 500 characters'),
  body('incurredAt')
    .isISO8601()
    .withMessage('Invalid incurredAt date format'),
]

export const validateUpdateExpense = [
  body('marketplaceId')
    .optional()
    .isUUID()
    .withMessage('Invalid marketplace ID format'),
  body('type')
    .optional()
    .isIn(['fixed', 'recurring', 'one-time'])
    .withMessage('Invalid expense type'),
  body('category')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Category must be between 1 and 100 characters'),
  body('amount')
    .optional()
    .isFloat({ gt: 0 })
    .withMessage('Amount must be greater than 0'),
  body('currency')
    .optional()
    .trim()
    .isLength({ min: 3, max: 10 })
    .withMessage('Currency must be between 3 and 10 characters'),
  body('allocatedProducts')
    .optional()
    .isArray()
    .withMessage('allocatedProducts must be an array'),
  body('allocatedProducts.*.sku')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('allocatedProducts sku is required'),
  body('allocatedProducts.*.percentage')
    .optional()
    .isFloat({ gt: 0, lte: 100 })
    .withMessage('allocatedProducts percentage must be between 0 and 100'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description must be less than 500 characters'),
  body('incurredAt')
    .optional()
    .isISO8601()
    .withMessage('Invalid incurredAt date format'),
]

export const validateBulkImport = [
  body('accountId')
    .optional()
    .isUUID()
    .withMessage('Invalid account ID format'),
]

