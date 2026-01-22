import { body, param, query } from 'express-validator'

export const validateInventoryFilters = [
  query('accountId').isUUID().withMessage('Account ID is required'),
  query('marketplaceId').optional().isUUID().withMessage('Invalid marketplace ID'),
  query('sku').optional().isString().withMessage('SKU must be a string'),
  query('status')
    .optional()
    .isIn(['low', 'normal', 'out_of_stock'])
    .withMessage('Invalid stock status'),
  query('page').optional().isInt({ gt: 0 }).toInt().withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ gt: 0, lt: 201 }).toInt().withMessage('Limit must be between 1 and 200'),
  query('includePendingShipments')
    .optional()
    .isBoolean()
    .toBoolean()
    .withMessage('includePendingShipments must be a boolean'),
]

export const validateInventoryAlerts = [
  query('accountId').isUUID().withMessage('Account ID is required'),
  query('marketplaceId').optional().isUUID().withMessage('Invalid marketplace ID'),
  query('sku').optional().isString().withMessage('SKU must be a string'),
]

export const validateSKUParam = [
  param('sku').trim().notEmpty().withMessage('SKU is required'),
]

export const validateInventoryUpdate = [
  body('accountId').isUUID().withMessage('Account ID is required'),
  body('marketplaceId').isUUID().withMessage('Marketplace ID is required'),
  body('amazonAccountId').optional().isUUID().withMessage('Invalid Amazon account ID'),
  body('quantityAvailable').optional().isInt({ min: 0 }).withMessage('quantityAvailable must be >= 0'),
  body('quantityReserved').optional().isInt({ min: 0 }).withMessage('quantityReserved must be >= 0'),
  body('lowStockThreshold').optional().isInt({ min: 0 }).withMessage('lowStockThreshold must be >= 0'),
]

