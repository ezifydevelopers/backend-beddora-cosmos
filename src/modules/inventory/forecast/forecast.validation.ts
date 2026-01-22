import { body, param, query } from 'express-validator'

export const validateForecastFilters = [
  query('accountId').isUUID().withMessage('Account ID is required'),
  query('marketplaceId').optional().isUUID().withMessage('Invalid marketplace ID'),
  query('sku').optional().isString().withMessage('SKU must be a string'),
]

export const validateSKUParam = [
  param('sku').trim().notEmpty().withMessage('SKU is required'),
]

export const validateForecastUpdate = [
  body('accountId').isUUID().withMessage('Account ID is required'),
  body('marketplaceId').optional().isUUID().withMessage('Invalid marketplace ID'),
  body('restockThreshold').optional().isInt({ min: 0 }).withMessage('restockThreshold must be >= 0'),
]

