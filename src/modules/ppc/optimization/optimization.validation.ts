import { body, param, query } from 'express-validator'

export const validateOptimizationFilters = [
  query('accountId').isUUID().withMessage('Account ID is required'),
  query('amazonAccountId').optional().isUUID().withMessage('Invalid Amazon account ID'),
  query('marketplaceId').optional().isUUID().withMessage('Invalid marketplace ID'),
  query('campaignId').optional().isUUID().withMessage('Invalid campaign ID'),
  query('adGroupId').optional().isUUID().withMessage('Invalid ad group ID'),
  query('keyword').optional().isString().withMessage('Keyword must be a string'),
  query('startDate').optional().isISO8601().toDate(),
  query('endDate').optional().isISO8601().toDate(),
]

export const validateOptimizationRun = [
  body('accountId').isUUID().withMessage('Account ID is required'),
  body('amazonAccountId').optional().isUUID().withMessage('Invalid Amazon account ID'),
  body('marketplaceId').optional().isUUID().withMessage('Invalid marketplace ID'),
  body('campaignId').optional().isUUID().withMessage('Invalid campaign ID'),
  body('adGroupId').optional().isUUID().withMessage('Invalid ad group ID'),
  body('keyword').optional().isString().withMessage('Keyword must be a string'),
  body('startDate').optional().isISO8601().toDate(),
  body('endDate').optional().isISO8601().toDate(),
  body('minBid').optional().isFloat({ min: 0 }).withMessage('minBid must be >= 0'),
  body('maxBid').optional().isFloat({ min: 0 }).withMessage('maxBid must be >= 0'),
  body('pauseAcosThreshold').optional().isFloat({ min: 0 }).withMessage('pauseAcosThreshold must be >= 0'),
  body('negativeAcosThreshold')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('negativeAcosThreshold must be >= 0'),
]

export const validateManualBidUpdate = [
  param('keywordId').isUUID().withMessage('Keyword ID is required'),
  body('accountId').isUUID().withMessage('Account ID is required'),
  body('currentBid').optional().isFloat({ min: 0 }).withMessage('currentBid must be >= 0'),
  body('targetAcos').optional().isFloat({ min: 0 }).withMessage('targetAcos must be >= 0'),
  body('targetProfitability')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('targetProfitability must be >= 0'),
  body('optimizationMode')
    .optional()
    .isIn(['manual', 'autoplay'])
    .withMessage('optimizationMode must be manual or autoplay'),
  body('status')
    .optional()
    .isIn(['active', 'paused', 'negative'])
    .withMessage('status must be active, paused, or negative'),
]

export const validateOptimizationHistory = [
  query('accountId').isUUID().withMessage('Account ID is required'),
  query('keywordId').optional().isUUID().withMessage('Invalid keyword ID'),
]

