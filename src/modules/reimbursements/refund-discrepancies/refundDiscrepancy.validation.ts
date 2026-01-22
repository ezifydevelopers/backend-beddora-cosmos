/**
 * Refund Discrepancy Validation
 *
 * Validates refund discrepancy input data before creating or updating records.
 */

import { z } from 'zod'
import { RefundDiscrepancyInput, RefundDiscrepancyUpdate } from './refundDiscrepancy.types'

export const createRefundDiscrepancySchema = z.object({
  marketplaceId: z.string().uuid('Marketplace ID must be a valid UUID'),
  productId: z.string().uuid('Product ID must be a valid UUID').optional(),
  sku: z.string().min(1, 'SKU cannot be empty').optional(),
  refundQuantity: z.number().int().min(1, 'Refund quantity must be at least 1'),
  returnedQuantity: z.number().int().min(0, 'Returned quantity cannot be negative'),
  unreimbursedAmount: z.number().min(0, 'Unreimbursed amount cannot be negative').optional(),
  refundReasonCode: z.string().optional(),
})

export const updateRefundDiscrepancySchema = z.object({
  status: z.enum(['pending', 'reconciled', 'ignored']).optional(),
  notes: z.string().max(1000).optional(),
})

export function validateCreateRefundDiscrepancy(
  data: unknown
): { success: true; data: RefundDiscrepancyInput } | { success: false; error: string } {
  try {
    const validated = createRefundDiscrepancySchema.parse(data)
    return { success: true, data: validated }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.errors[0]?.message || 'Validation failed' }
    }
    return { success: false, error: 'Invalid input data' }
  }
}

export function validateUpdateRefundDiscrepancy(
  data: unknown
): { success: true; data: RefundDiscrepancyUpdate } | { success: false; error: string } {
  try {
    const validated = updateRefundDiscrepancySchema.parse(data)
    return { success: true, data: validated }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.errors[0]?.message || 'Validation failed' }
    }
    return { success: false, error: 'Invalid input data' }
  }
}

