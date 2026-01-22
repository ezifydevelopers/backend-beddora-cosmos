/**
 * Multi-Marketplace Validation
 */

import { z } from 'zod'
import { UserMarketplaceInput, UserMarketplaceUpdate } from './marketplace.types'

export const linkMarketplaceSchema = z.object({
  marketplaceId: z.string().uuid('Marketplace ID must be a valid UUID'),
  amazonAccountId: z.string().uuid().optional(),
  credentials: z.record(z.string()).optional(),
  status: z.enum(['active', 'inactive']).optional(),
})

export const updateMarketplaceSchema = z.object({
  amazonAccountId: z.string().uuid().nullable().optional(),
  credentials: z.record(z.string()).nullable().optional(),
  status: z.enum(['active', 'inactive']).optional(),
})

export function validateLinkMarketplace(
  data: unknown
): { success: true; data: UserMarketplaceInput } | { success: false; error: string } {
  try {
    const validated = linkMarketplaceSchema.parse(data)
    return { success: true, data: validated }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.errors[0]?.message || 'Validation failed' }
    }
    return { success: false, error: 'Invalid input data' }
  }
}

export function validateUpdateMarketplace(
  data: unknown
): { success: true; data: UserMarketplaceUpdate } | { success: false; error: string } {
  try {
    const validated = updateMarketplaceSchema.parse(data)
    return { success: true, data: validated }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.errors[0]?.message || 'Validation failed' }
    }
    return { success: false, error: 'Invalid input data' }
  }
}

