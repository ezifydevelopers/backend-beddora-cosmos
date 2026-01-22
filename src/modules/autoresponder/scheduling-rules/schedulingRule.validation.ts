/**
 * Scheduling Rule Validation
 * 
 * Validates scheduling rule input data before creating or updating rules.
 */

import { z } from 'zod'
import { SchedulingRuleInput, SchedulingRuleUpdate } from './schedulingRule.types'

/**
 * Validation schema for scheduling rule conditions
 */
const schedulingRuleConditionsSchema = z.object({
  firstTimeBuyer: z.boolean().optional(),
  notReturned: z.boolean().optional(),
  minOrderValue: z.number().int().min(0).optional(),
  maxOrderValue: z.number().int().min(0).optional(),
  productCategories: z.array(z.string()).optional(),
  skus: z.array(z.string()).optional(),
  hasReview: z.boolean().optional(),
  noReview: z.boolean().optional(),
}).passthrough() // Allow additional custom conditions

/**
 * Validation schema for creating a scheduling rule
 */
export const createSchedulingRuleSchema = z.object({
  templateId: z.string().uuid('Template ID must be a valid UUID'),
  accountId: z.string().uuid('Account ID must be a valid UUID').optional(),
  marketplaceId: z.string().uuid('Marketplace ID must be a valid UUID').optional(),
  productId: z.string().uuid('Product ID must be a valid UUID').optional(),
  sku: z.string().min(1, 'SKU cannot be empty').optional(),
  deliveryDelayDays: z
    .number()
    .int('Delivery delay must be an integer')
    .min(0, 'Delivery delay cannot be negative')
    .max(365, 'Delivery delay cannot exceed 365 days'),
  conditions: schedulingRuleConditionsSchema.optional(),
  isActive: z.boolean().optional().default(true),
})

/**
 * Validation schema for updating a scheduling rule
 */
export const updateSchedulingRuleSchema = z.object({
  templateId: z.string().uuid('Template ID must be a valid UUID').optional(),
  accountId: z.string().uuid('Account ID must be a valid UUID').nullable().optional(),
  marketplaceId: z.string().uuid('Marketplace ID must be a valid UUID').nullable().optional(),
  productId: z.string().uuid('Product ID must be a valid UUID').nullable().optional(),
  sku: z.string().min(1, 'SKU cannot be empty').nullable().optional(),
  deliveryDelayDays: z
    .number()
    .int('Delivery delay must be an integer')
    .min(0, 'Delivery delay cannot be negative')
    .max(365, 'Delivery delay cannot exceed 365 days')
    .optional(),
  conditions: schedulingRuleConditionsSchema.nullable().optional(),
  isActive: z.boolean().optional(),
})

/**
 * Validates scheduling rule input for creation
 */
export function validateCreateSchedulingRule(
  data: unknown
): { success: true; data: SchedulingRuleInput } | { success: false; error: string } {
  try {
    const validated = createSchedulingRuleSchema.parse(data)
    return { success: true, data: validated }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.errors[0]?.message || 'Validation failed' }
    }
    return { success: false, error: 'Invalid input data' }
  }
}

/**
 * Validates scheduling rule input for update
 */
export function validateUpdateSchedulingRule(
  data: unknown
): { success: true; data: SchedulingRuleUpdate } | { success: false; error: string } {
  try {
    const validated = updateSchedulingRuleSchema.parse(data)
    return { success: true, data: validated }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.errors[0]?.message || 'Validation failed' }
    }
    return { success: false, error: 'Invalid input data' }
  }
}

