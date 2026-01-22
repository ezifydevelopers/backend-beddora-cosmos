import { body, param, query } from 'express-validator'

export const validateExportReport = [
  query('reportType')
    .isIn(['profit', 'inventory', 'ppc', 'returns'])
    .withMessage('Invalid reportType'),
  query('format')
    .isIn(['csv', 'excel', 'pdf'])
    .withMessage('Invalid format'),
  query('accountId')
    .isUUID()
    .withMessage('Invalid accountId'),
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid startDate'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid endDate'),
  query('marketplaceId')
    .optional()
    .isUUID()
    .withMessage('Invalid marketplaceId'),
  query('amazonAccountId')
    .optional()
    .isUUID()
    .withMessage('Invalid amazonAccountId'),
]

export const validateScheduleCreate = [
  body('accountId').isUUID().withMessage('Invalid accountId'),
  body('reportType').isIn(['profit', 'inventory', 'ppc', 'returns']).withMessage('Invalid reportType'),
  body('schedule').isIn(['daily', 'weekly', 'monthly']).withMessage('Invalid schedule'),
  body('filters').isObject().withMessage('filters is required'),
  body('emailRecipients').isArray({ min: 1 }).withMessage('emailRecipients is required'),
  body('emailRecipients.*').isEmail().withMessage('Invalid email recipient'),
]

export const validateScheduleUpdate = [
  param('id').isUUID().withMessage('Invalid schedule id'),
  body('reportType').optional().isIn(['profit', 'inventory', 'ppc', 'returns']).withMessage('Invalid reportType'),
  body('schedule').optional().isIn(['daily', 'weekly', 'monthly']).withMessage('Invalid schedule'),
  body('filters').optional().isObject().withMessage('Invalid filters'),
  body('emailRecipients').optional().isArray().withMessage('Invalid emailRecipients'),
  body('emailRecipients.*').optional().isEmail().withMessage('Invalid email recipient'),
]

export const validateScheduleId = [
  param('id').isUUID().withMessage('Invalid schedule id'),
]

export const validateListSchedules = [
  query('accountId').isUUID().withMessage('Invalid accountId'),
]

