import { z } from 'zod'

/**
 * Validation schemas for Amazon sync operations
 */

/**
 * Sync request schema
 * Validates data for sync operations
 */
export const syncRequestSchema = z.object({
  amazonAccountId: z.string().uuid('Invalid Amazon account ID format'),
  startDate: z
    .string()
    .datetime('Invalid start date format. Use ISO 8601 format.')
    .optional(),
  endDate: z
    .string()
    .datetime('Invalid end date format. Use ISO 8601 format.')
    .optional(),
  marketplaceIds: z
    .array(z.string())
    .optional(),
  forceFullSync: z.boolean().optional(),
})

export type SyncRequestInput = z.infer<typeof syncRequestSchema>

