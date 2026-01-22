import { param, query } from 'express-validator'

export const validateFeedbackAlertsFilters = [
  query('marketplaceId').optional().isUUID().withMessage('Invalid marketplace ID'),
  query('asin').optional().isString().withMessage('ASIN must be a string'),
  query('sku').optional().isString().withMessage('SKU must be a string'),
  query('rating').optional().isFloat({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
  query('status').optional().isIn(['unread', 'read', 'resolved']).withMessage('Invalid status'),
]

export const validateFeedbackAsin = [
  param('asin').isString().withMessage('ASIN is required'),
]

export const validateFeedbackAlertId = [
  param('id').isUUID().withMessage('Alert ID is required'),
]

