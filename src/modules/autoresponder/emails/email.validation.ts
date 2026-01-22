import { body, param } from 'express-validator'

export const validateTemplateCreate = [
  body('name').isString().notEmpty().withMessage('Template name is required'),
  body('subject').isString().notEmpty().withMessage('Subject is required'),
  body('body').isString().notEmpty().withMessage('Body is required'),
  body('variables').optional().isObject(),
  body('marketplaceId').optional().isUUID(),
  body('productId').optional().isUUID(),
  body('sku').optional().isString(),
  body('purchaseType').optional().isString(),
]

export const validateTemplateUpdate = [
  param('id').isUUID().withMessage('Template ID is required'),
  body('name').optional().isString(),
  body('subject').optional().isString(),
  body('body').optional().isString(),
  body('variables').optional().isObject(),
  body('marketplaceId').optional().isUUID(),
  body('productId').optional().isUUID(),
  body('sku').optional().isString(),
  body('purchaseType').optional().isString(),
]

export const validateTemplateDelete = [
  param('id').isUUID().withMessage('Template ID is required'),
]

export const validateSendEmail = [
  body('templateId').isUUID().withMessage('Template ID is required'),
  body('recipientEmail').isEmail().withMessage('Recipient email is required'),
  body('scheduledAt').optional().isISO8601(),
  body('variables').optional().isObject(),
  body('eventKey').optional().isString(),
]

