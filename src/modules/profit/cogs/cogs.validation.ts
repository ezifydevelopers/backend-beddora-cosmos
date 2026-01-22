import { body, param, query } from 'express-validator'
import { CostMethod } from '../../../types/cogs.types'

/**
 * COGS validation rules
 * Validates request data for COGS endpoints
 */

/**
 * Validate SKU parameter
 */
export const validateSKU = [
  param('sku')
    .trim()
    .notEmpty()
    .withMessage('SKU is required')
    .isLength({ min: 1, max: 100 })
    .withMessage('SKU must be between 1 and 100 characters'),
]

/**
 * Validate COGS ID parameter
 */
export const validateCOGSId = [
  param('id')
    .isUUID()
    .withMessage('Invalid COGS ID format'),
]

/**
 * Validate batch ID parameter
 */
export const validateBatchId = [
  param('batchId')
    .isUUID()
    .withMessage('Invalid batch ID format'),
]

/**
 * Create COGS validation
 */
export const validateCreateCOGS = [
  body('sku')
    .trim()
    .notEmpty()
    .withMessage('SKU is required')
    .isLength({ min: 1, max: 100 })
    .withMessage('SKU must be between 1 and 100 characters'),

  body('accountId')
    .isUUID()
    .withMessage('Invalid account ID format'),

  body('marketplaceId')
    .optional()
    .isUUID()
    .withMessage('Invalid marketplace ID format'),

  body('batchId')
    .optional()
    .isUUID()
    .withMessage('Invalid batch ID format'),

  body('quantity')
    .isInt({ min: 1 })
    .withMessage('Quantity must be a positive integer'),

  body('unitCost')
    .isFloat({ min: 0 })
    .withMessage('Unit cost must be a non-negative number'),

  body('costMethod')
    .optional()
    .isIn(Object.values(CostMethod))
    .withMessage(`Cost method must be one of: ${Object.values(CostMethod).join(', ')}`),

  body('shipmentCost')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Shipment cost must be a non-negative number'),

  body('purchaseDate')
    .optional()
    .isISO8601()
    .withMessage('Purchase date must be a valid ISO 8601 date'),
]

/**
 * Update COGS validation
 */
export const validateUpdateCOGS = [
  body('quantity')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Quantity must be a positive integer'),

  body('unitCost')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Unit cost must be a non-negative number'),

  body('shipmentCost')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Shipment cost must be a non-negative number'),

  body('costMethod')
    .optional()
    .isIn(Object.values(CostMethod))
    .withMessage(`Cost method must be one of: ${Object.values(CostMethod).join(', ')}`),

  body('purchaseDate')
    .optional()
    .isISO8601()
    .withMessage('Purchase date must be a valid ISO 8601 date'),
]

/**
 * Create batch validation
 */
export const validateCreateBatch = [
  body('sku')
    .trim()
    .notEmpty()
    .withMessage('SKU is required')
    .isLength({ min: 1, max: 100 })
    .withMessage('SKU must be between 1 and 100 characters'),

  body('accountId')
    .isUUID()
    .withMessage('Invalid account ID format'),

  body('quantity')
    .isInt({ min: 1 })
    .withMessage('Quantity must be a positive integer'),

  body('unitCost')
    .isFloat({ min: 0 })
    .withMessage('Unit cost must be a non-negative number'),

  body('notes')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Notes must be less than 500 characters'),

  body('receivedAt')
    .optional()
    .isISO8601()
    .withMessage('Received date must be a valid ISO 8601 date'),
]

/**
 * Historical COGS query validation
 */
export const validateCOGSHistorical = [
  query('accountId')
    .isUUID()
    .withMessage('Invalid account ID format'),

  query('sku')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('SKU must be between 1 and 100 characters'),

  query('marketplaceId')
    .optional()
    .isUUID()
    .withMessage('Invalid marketplace ID format'),

  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid ISO 8601 date'),

  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid ISO 8601 date'),
]

