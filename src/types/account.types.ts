/**
 * Account-related type definitions
 */

/**
 * Create account data
 */
export interface CreateAccountData {
  name: string
  sellerId?: string
  region?: string
  marketplaceIds?: string[]
}

/**
 * Account response
 */
export interface AccountResponse {
  id: string
  name: string
  sellerId: string | null
  region: string | null
  isDefault: boolean
  isActive: boolean
  marketplaces: MarketplaceResponse[]
  createdAt: Date
}

/**
 * Marketplace response
 */
export interface MarketplaceResponse {
  id: string
  name: string
  code: string
  region: string | null
  isActive: boolean
}

/**
 * Switch account response
 */
export interface SwitchAccountResponse {
  accountId: string
  message: string
}

/**
 * Link Amazon Account data
 * 
 * Supports both legacy (accessKey/secretKey) and SP-API (lwaClientId/lwaClientSecret) formats
 */
export interface LinkAmazonAccountData {
  marketplace: string
  sellerId: string
  // SP-API fields (preferred)
  lwaClientId?: string // App ID from Seller Central
  lwaClientSecret?: string // Client Secret (optional for Application IDs)
  refreshToken: string
  // Legacy fields (for backward compatibility)
  accessKey?: string // Maps to lwaClientId if not provided
  secretKey?: string // Maps to lwaClientSecret if not provided
  // Optional SP-API fields
  iamRoleArn?: string // IAM Role ARN (can be added later)
  marketplaceIds?: string[] // Marketplace IDs (defaults based on marketplace)
  region?: string // AWS region (defaults to us-east-1)
}

/**
 * Update Amazon Account data
 * All fields are optional - only provided fields will be updated
 */
export interface UpdateAmazonAccountData {
  sellerId?: string
  accessKey?: string
  secretKey?: string
  refreshToken?: string
  isActive?: boolean
}

/**
 * Amazon Account response
 * Note: Credentials are never included in responses for security
 */
export interface AmazonAccountResponse {
  id: string
  userId: string
  marketplace: string
  sellerId: string
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}
