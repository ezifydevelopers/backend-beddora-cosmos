import { query } from 'express-validator'

export const validateChartFilters = [
  query('accountId').optional().isUUID().withMessage('Invalid account ID format'),
  query('amazonAccountId').optional().isUUID().withMessage('Invalid amazonAccountId format'),
  query('marketplaceId').optional().isUUID().withMessage('Invalid marketplace ID format'),
  query('sku').optional().trim().isLength({ min: 1, max: 100 }).withMessage('Invalid SKU'),
  query('campaignId').optional().trim().isLength({ min: 1, max: 100 }).withMessage('Invalid campaignId'),
  query('startDate').optional().isISO8601().withMessage('Invalid startDate format'),
  query('endDate').optional().isISO8601().withMessage('Invalid endDate format'),
  query('period')
    .optional()
    .isIn(['day', 'week', 'month', 'quarter', 'year'])
    .withMessage('Invalid period'),
]

export const validateComparisonFilters = [
  ...validateChartFilters,
  query('metric')
    .optional()
    .isIn(['profit', 'sales', 'ppc', 'returns'])
    .withMessage('Invalid metric'),
]

