import { query } from 'express-validator'

export const validateProfitMetricsFilters = [
  query('accountId').isUUID().withMessage('Account ID is required'),
  query('amazonAccountId').optional().isUUID().withMessage('Invalid Amazon account ID'),
  query('marketplaceId').optional().isUUID().withMessage('Invalid marketplace ID'),
  query('sku').optional().isString().withMessage('SKU must be a string'),
  query('startDate').optional().isISO8601().toDate(),
  query('endDate').optional().isISO8601().toDate(),
  query('period').optional().isIn(['day', 'week', 'month']).withMessage('Invalid period'),
]

