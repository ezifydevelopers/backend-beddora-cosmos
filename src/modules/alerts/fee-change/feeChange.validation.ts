import { param, query } from 'express-validator'

export const validateFeeChangeAlertsFilters = [
  query('marketplaceId').optional().isUUID().withMessage('Invalid marketplace ID'),
  query('sku').optional().isString().withMessage('SKU must be a string'),
  query('feeType').optional().isString().withMessage('Fee type must be a string'),
  query('status').optional().isIn(['unread', 'read', 'resolved']).withMessage('Invalid status'),
]

export const validateFeeChangeMarketplace = [
  param('marketplaceId').isUUID().withMessage('Marketplace ID is required'),
]

export const validateFeeChangeAlertId = [
  param('id').isUUID().withMessage('Alert ID is required'),
]

