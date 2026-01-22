import { param, query } from 'express-validator'

export const validateBuyBoxAlertsFilters = [
  query('marketplaceId').optional().isUUID().withMessage('Invalid marketplace ID'),
  query('asin').optional().isString().withMessage('ASIN must be a string'),
  query('sku').optional().isString().withMessage('SKU must be a string'),
  query('status').optional().isIn(['unread', 'read', 'resolved']).withMessage('Invalid status'),
]

export const validateBuyBoxAsin = [
  param('asin').isString().withMessage('ASIN is required'),
]

export const validateBuyBoxAlertId = [
  param('id').isUUID().withMessage('Alert ID is required'),
]

