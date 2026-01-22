import { body, param, query } from 'express-validator'

export const validateInventoryKpiFilters = [
  query('accountId').isUUID().withMessage('Account ID is required'),
  query('marketplaceId').optional().isUUID().withMessage('Invalid marketplace ID'),
  query('sku').optional().isString().withMessage('SKU must be a string'),
  query('status').optional().isIn(['low', 'normal', 'overstock']).withMessage('Invalid stock status'),
]

export const validateSkuParam = [
  param('sku').trim().notEmpty().withMessage('SKU is required'),
]

export const validateKpiRecalc = [
  body('accountId').isUUID().withMessage('Account ID is required'),
  body('marketplaceId').optional().isUUID().withMessage('Invalid marketplace ID'),
  body('sku').optional().isString().withMessage('SKU must be a string'),
]

