import { body, param, query } from 'express-validator'

export const validateInboundFilters = [
  query('accountId').isUUID().withMessage('Account ID is required'),
  query('purchaseOrderId').optional().isUUID().withMessage('Invalid purchaseOrderId'),
  query('sku').optional().isString().withMessage('Invalid SKU'),
  query('status').optional().isString().withMessage('Invalid status'),
]

export const validateInboundId = [
  param('id').isUUID().withMessage('Invalid inbound shipment ID'),
]

export const validateInboundUpdate = [
  body('accountId').isUUID().withMessage('Account ID is required'),
  body('quantityReceived').isInt({ min: 0 }).withMessage('quantityReceived must be >= 0'),
  body('status').optional().isString().withMessage('Invalid status'),
  body('receivedDate').optional().isISO8601().toDate(),
]

