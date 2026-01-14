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
 */
export interface LinkAmazonAccountData {
  marketplace: string
  sellerId: string
  accessKey: string
  secretKey: string
  refreshToken: string
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
