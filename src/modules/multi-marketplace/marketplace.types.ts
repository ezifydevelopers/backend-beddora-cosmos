/**
 * Multi-Marketplace Types
 */

export interface UserMarketplaceInput {
  marketplaceId: string
  amazonAccountId?: string
  credentials?: Record<string, string>
  status?: 'active' | 'inactive'
}

export interface UserMarketplaceUpdate {
  amazonAccountId?: string | null
  credentials?: Record<string, string> | null
  status?: 'active' | 'inactive'
}

