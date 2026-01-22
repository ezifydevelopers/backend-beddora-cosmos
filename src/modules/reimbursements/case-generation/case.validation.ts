/**
 * Reimbursement Case Validation
 */

import { z } from 'zod'
import { ReimbursementCaseInput, ReimbursementCaseUpdate } from './case.types'

export const createCaseSchema = z.object({
  caseType: z.enum(['lost', 'damaged', 'refund_discrepancy']),
  marketplaceId: z.string().uuid('Marketplace ID must be a valid UUID'),
  productId: z.string().uuid().optional(),
  sku: z.string().min(1).optional(),
  sourceId: z.string().uuid().optional(),
  customNotes: z.string().max(1000).optional(),
})

export const updateCaseSchema = z.object({
  generatedText: z.string().min(10).optional(),
  submissionStatus: z.enum(['draft', 'submitted', 'resolved']).optional(),
  submissionDate: z.string().optional().nullable(),
  resolutionDate: z.string().optional().nullable(),
  notes: z.string().max(1000).optional(),
})

export function validateCreateCase(
  data: unknown
): { success: true; data: ReimbursementCaseInput } | { success: false; error: string } {
  try {
    const validated = createCaseSchema.parse(data)
    return { success: true, data: validated }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.errors[0]?.message || 'Validation failed' }
    }
    return { success: false, error: 'Invalid input data' }
  }
}

export function validateUpdateCase(
  data: unknown
): { success: true; data: ReimbursementCaseUpdate } | { success: false; error: string } {
  try {
    const validated = updateCaseSchema.parse(data)
    return { success: true, data: validated }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.errors[0]?.message || 'Validation failed' }
    }
    return { success: false, error: 'Invalid input data' }
  }
}

