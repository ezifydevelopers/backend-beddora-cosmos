import { body, param, query } from 'express-validator'

export const validateReturnId = [
  param('id').isUUID().withMessage('Invalid return ID format'),
]

export const validateReturnFilters = [
  query('accountId').optional().isUUID().withMessage('Invalid account ID format'),
  query('marketplaceId').optional().isUUID().withMessage('Invalid marketplace ID format'),
  query('sku').optional().trim().isLength({ min: 1, max: 100 }).withMessage('Invalid SKU'),
  query('reasonCode').optional().trim().isLength({ min: 1, max: 100 }).withMessage('Invalid reason code'),
  query('startDate').optional().isISO8601().withMessage('Invalid startDate format'),
  query('endDate').optional().isISO8601().withMessage('Invalid endDate format'),
  query('period')
    .optional()
    .isIn(['day', 'week', 'month'])
    .withMessage('Invalid period'),
]

export const validateCreateReturn = [
  body('orderId').isUUID().withMessage('Invalid order ID format'),
  body('sku').trim().notEmpty().withMessage('SKU is required'),
  body('accountId').isUUID().withMessage('Invalid account ID format'),
  body('marketplaceId').optional().isUUID().withMessage('Invalid marketplace ID format'),
  body('quantityReturned').isInt({ gt: 0 }).withMessage('quantityReturned must be > 0'),
  body('reasonCode').trim().notEmpty().withMessage('reasonCode is required'),
  body('refundAmount').isFloat({ gte: 0 }).withMessage('refundAmount must be >= 0'),
  body('feeAmount').isFloat({ gte: 0 }).withMessage('feeAmount must be >= 0'),
  body('isSellable').isBoolean().withMessage('isSellable must be boolean'),
]

export const validateUpdateReturn = [
  body('sku').optional().trim().isLength({ min: 1, max: 100 }).withMessage('Invalid SKU'),
  body('marketplaceId').optional().isUUID().withMessage('Invalid marketplace ID format'),
  body('quantityReturned').optional().isInt({ gt: 0 }).withMessage('quantityReturned must be > 0'),
  body('reasonCode').optional().trim().isLength({ min: 1, max: 100 }).withMessage('Invalid reasonCode'),
  body('refundAmount').optional().isFloat({ gte: 0 }).withMessage('refundAmount must be >= 0'),
  body('feeAmount').optional().isFloat({ gte: 0 }).withMessage('feeAmount must be >= 0'),
  body('isSellable').optional().isBoolean().withMessage('isSellable must be boolean'),
]

