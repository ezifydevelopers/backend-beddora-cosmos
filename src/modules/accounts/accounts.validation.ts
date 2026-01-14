import { z } from 'zod'

/**
 * Validation schemas for account management
 * 
 * Uses Zod for runtime validation
 * All schemas are type-safe and provide clear error messages
 */

// ============================================
// INTERNAL ACCOUNT VALIDATION
// ============================================

/**
 * Create account schema
 * Validates data for creating a new internal account
 */
export const createAccountSchema = z.object({
  name: z
    .string()
    .min(1, 'Account name is required')
    .max(100, 'Account name must be less than 100 characters')
    .trim(),
  sellerId: z
    .string()
    .min(1, 'Seller ID is required')
    .max(50, 'Seller ID must be less than 50 characters')
    .trim()
    .optional(),
  region: z
    .string()
    .max(10, 'Region code must be less than 10 characters')
    .trim()
    .optional(),
  marketplaceIds: z
    .array(z.string().uuid('Invalid marketplace ID format'))
    .optional(),
})

export type CreateAccountInput = z.infer<typeof createAccountSchema>

/**
 * Switch account schema
 * Validates data for switching active account
 */
export const switchAccountSchema = z.object({
  accountId: z.string().uuid('Invalid account ID format'),
})

export type SwitchAccountInput = z.infer<typeof switchAccountSchema>

// ============================================
// AMAZON ACCOUNT VALIDATION
// ============================================

/**
 * Marketplace code validation
 * Validates Amazon marketplace codes (2-3 uppercase letters)
 */
const marketplaceCodeSchema = z
  .string()
  .min(2, 'Marketplace code must be at least 2 characters')
  .max(3, 'Marketplace code must be at most 3 characters')
  .regex(/^[A-Z]{2,3}$/, 'Marketplace code must be 2-3 uppercase letters (e.g., US, UK, DE, JP)')
  .transform((val) => val.toUpperCase().trim())

/**
 * Seller ID validation
 * Amazon Seller IDs are typically alphanumeric strings
 */
const sellerIdSchema = z
  .string()
  .min(1, 'Seller ID is required')
  .max(50, 'Seller ID must be less than 50 characters')
  .regex(/^[A-Z0-9_-]+$/i, 'Seller ID contains invalid characters')
  .trim()

/**
 * API Key validation
 * Amazon LWA (Login with Amazon) access keys are typically long strings
 */
const accessKeySchema = z
  .string()
  .min(20, 'Access key must be at least 20 characters')
  .max(500, 'Access key must be less than 500 characters')
  .trim()

/**
 * Secret key validation
 * Amazon LWA secret keys are typically long strings
 */
const secretKeySchema = z
  .string()
  .min(20, 'Secret key must be at least 20 characters')
  .max(500, 'Secret key must be less than 500 characters')
  .trim()

/**
 * Refresh token validation
 * Amazon LWA refresh tokens are typically long strings
 */
const refreshTokenSchema = z
  .string()
  .min(20, 'Refresh token must be at least 20 characters')
  .max(1000, 'Refresh token must be less than 1000 characters')
  .trim()

/**
 * Link Amazon account schema
 * Validates data for linking a new Amazon Seller Central account
 */
export const linkAmazonAccountSchema = z.object({
  marketplace: marketplaceCodeSchema,
  sellerId: sellerIdSchema,
  accessKey: accessKeySchema,
  secretKey: secretKeySchema,
  refreshToken: refreshTokenSchema,
})

export type LinkAmazonAccountInput = z.infer<typeof linkAmazonAccountSchema>

/**
 * Update Amazon account schema
 * All fields are optional - only provided fields will be validated
 */
export const updateAmazonAccountSchema = z.object({
  sellerId: sellerIdSchema.optional(),
  accessKey: accessKeySchema.optional(),
  secretKey: secretKeySchema.optional(),
  refreshToken: refreshTokenSchema.optional(),
  isActive: z.boolean().optional(),
})

export type UpdateAmazonAccountInput = z.infer<typeof updateAmazonAccountSchema>

/**
 * Common marketplace codes for reference
 * These are the standard Amazon marketplace codes
 */
export const AMAZON_MARKETPLACE_CODES = [
  'US', // United States
  'CA', // Canada
  'MX', // Mexico
  'BR', // Brazil
  'UK', // United Kingdom
  'DE', // Germany
  'FR', // France
  'IT', // Italy
  'ES', // Spain
  'NL', // Netherlands
  'SE', // Sweden
  'PL', // Poland
  'JP', // Japan
  'AU', // Australia
  'IN', // India
  'SG', // Singapore
  'AE', // United Arab Emirates
  'SA', // Saudi Arabia
  'TR', // Turkey
  'EG', // Egypt
] as const

/**
 * Validate marketplace code against known codes
 * This is a helper function, not a schema
 */
export function isValidMarketplaceCode(code: string): boolean {
  return AMAZON_MARKETPLACE_CODES.includes(code.toUpperCase() as any)
}
