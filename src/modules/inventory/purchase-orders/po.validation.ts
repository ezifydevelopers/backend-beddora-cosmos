import { body, param, query } from 'express-validator'

export const validatePurchaseOrderFilters = [
  query('accountId').isUUID().withMessage('Account ID is required'),
  query('supplierId').optional().isUUID().withMessage('Invalid supplier ID'),
  query('marketplaceId').optional().isUUID().withMessage('Invalid marketplace ID'),
  query('status').optional().isString().withMessage('Invalid status'),
  query('sku').optional().isString().withMessage('Invalid SKU'),
]

export const validatePOId = [
  param('id').isUUID().withMessage('Invalid PO ID'),
]

export const validateCreatePO = [
  body('accountId').isUUID().withMessage('Account ID is required'),
  body('supplierId').isUUID().withMessage('Supplier ID is required'),
  body('poNumber').notEmpty().withMessage('PO number is required'),
  body('marketplaceId').optional().isUUID().withMessage('Invalid marketplace ID'),
  body('estimatedDeliveryDate').optional().isISO8601().toDate(),
  body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
  body('items.*.sku').notEmpty().withMessage('SKU is required'),
  body('items.*.quantity').isInt({ gt: 0 }).withMessage('Quantity must be > 0'),
  body('items.*.unitCost').isFloat({ gt: 0 }).withMessage('Unit cost must be > 0'),
  body('items.*.productId').optional().isUUID().withMessage('Invalid product ID'),
]

export const validateUpdatePO = [
  body('accountId').isUUID().withMessage('Account ID is required'),
  body('supplierId').optional().isUUID().withMessage('Invalid supplier ID'),
  body('marketplaceId').optional().isUUID().withMessage('Invalid marketplace ID'),
  body('status').optional().isString().withMessage('Invalid status'),
  body('estimatedDeliveryDate').optional().isISO8601().toDate(),
]

export const validateDuplicatePO = [
  body('accountId').isUUID().withMessage('Account ID is required'),
  body('poNumber').notEmpty().withMessage('New PO number is required'),
]

export const validateCancelPO = [
  query('accountId').isUUID().withMessage('Account ID is required'),
]

