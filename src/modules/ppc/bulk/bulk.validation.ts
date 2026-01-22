import { body, query } from 'express-validator'

export const validateBulkBidUpdate = [
  body('accountId').isUUID().withMessage('Account ID is required'),
  body('marketplaceId').optional().isUUID().withMessage('Invalid marketplace ID'),
  body('amazonAccountId').optional().isUUID().withMessage('Invalid Amazon account ID'),
  body('targetType').optional().isIn(['campaign', 'adGroup', 'keyword']),
  body('targetIds').optional().isArray(),
  body('newBid').isFloat({ min: 0 }).withMessage('newBid must be >= 0'),
  body('minBid').optional().isFloat({ min: 0 }),
  body('maxBid').optional().isFloat({ min: 0 }),
  body('preview').optional().isBoolean(),
  body('reason').optional().isString(),
  body('campaignId').optional().isUUID(),
  body('adGroupId').optional().isUUID(),
  body('keyword').optional().isString(),
  body('sku').optional().isString(),
]

export const validateBulkStatusChange = [
  body('accountId').isUUID().withMessage('Account ID is required'),
  body('marketplaceId').optional().isUUID().withMessage('Invalid marketplace ID'),
  body('amazonAccountId').optional().isUUID().withMessage('Invalid Amazon account ID'),
  body('targetType').optional().isIn(['campaign', 'adGroup', 'keyword']),
  body('targetIds').optional().isArray(),
  body('status').isIn(['active', 'paused', 'negative']).withMessage('Invalid status'),
  body('preview').optional().isBoolean(),
  body('reason').optional().isString(),
  body('campaignId').optional().isUUID(),
  body('adGroupId').optional().isUUID(),
  body('keyword').optional().isString(),
  body('sku').optional().isString(),
]

export const validateApplyRecommendations = [
  body('accountId').isUUID().withMessage('Account ID is required'),
  body('marketplaceId').optional().isUUID().withMessage('Invalid marketplace ID'),
  body('amazonAccountId').optional().isUUID().withMessage('Invalid Amazon account ID'),
  body('targetType').optional().isIn(['campaign', 'adGroup', 'keyword']),
  body('targetIds').optional().isArray(),
  body('minBid').optional().isFloat({ min: 0 }),
  body('maxBid').optional().isFloat({ min: 0 }),
  body('preview').optional().isBoolean(),
  body('reason').optional().isString(),
  body('campaignId').optional().isUUID(),
  body('adGroupId').optional().isUUID(),
  body('keyword').optional().isString(),
  body('sku').optional().isString(),
]

export const validateBulkHistory = [
  query('accountId').isUUID().withMessage('Account ID is required'),
]

export const validateBulkRevert = [
  body('accountId').isUUID().withMessage('Account ID is required'),
  body('historyId').isUUID().withMessage('History ID is required'),
]

