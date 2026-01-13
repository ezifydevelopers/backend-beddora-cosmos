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
