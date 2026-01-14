import { z } from 'zod'

/**
 * Validation schemas for manual import operations
 */

/**
 * Import type enum
 */
export const importTypeSchema = z.enum(['orders', 'fees', 'ppc', 'inventory', 'listings', 'refunds'])

/**
 * Staging status enum
 */
export const stagingStatusSchema = z.enum(['pending', 'approved', 'rejected', 'finalized'])

/**
 * Upload file schema
 */
export const uploadFileSchema = z.object({
  amazonAccountId: z.string().uuid('Invalid Amazon account ID format'),
  marketplaceId: z.string().min(1, 'Marketplace ID is required'),
  importType: importTypeSchema,
})

export type UploadFileInput = z.infer<typeof uploadFileSchema>

/**
 * Approve/reject rows schema
 */
export const approveRejectSchema = z.object({
  amazonAccountId: z.string().uuid('Invalid Amazon account ID format'),
  rowIds: z
    .array(z.string().uuid('Invalid row ID format'))
    .min(1, 'At least one row ID is required'),
})

export type ApproveRejectInput = z.infer<typeof approveRejectSchema>

/**
 * Finalize import schema
 */
export const finalizeSchema = z.object({
  amazonAccountId: z.string().uuid('Invalid Amazon account ID format'),
})

export type FinalizeInput = z.infer<typeof finalizeSchema>

