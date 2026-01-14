/**
 * Profit module types
 * Type definitions for profit calculations and aggregations
 */

/**
 * Profit filter parameters
 * Used to filter profit calculations by various dimensions
 */
export interface ProfitFilters {
  accountId?: string
  amazonAccountId?: string
  marketplaceId?: string
  sku?: string
  startDate?: string
  endDate?: string
  period?: 'day' | 'week' | 'month' | 'custom'
}

/**
 * Profit summary metrics
 * Aggregated financial metrics for a given period
 */
export interface ProfitSummary {
  salesRevenue: number
  totalExpenses: number
  totalFees: number
  totalRefunds: number
  totalCOGS: number
  grossProfit: number
  netProfit: number
  grossMargin: number
  netMargin: number
  orderCount: number
  period: {
    startDate: string | null
    endDate: string | null
  }
}

/**
 * Product-level profit breakdown
 * Profit metrics grouped by SKU/Product
 */
export interface ProductProfitBreakdown {
  sku: string
  productId: string | null
  productTitle: string | null
  salesRevenue: number
  totalExpenses: number
  totalFees: number
  totalRefunds: number
  totalCOGS: number
  grossProfit: number
  netProfit: number
  grossMargin: number
  netMargin: number
  unitsSold: number
  orderCount: number
}

/**
 * Marketplace-level profit breakdown
 * Profit metrics grouped by Marketplace
 */
export interface MarketplaceProfitBreakdown {
  marketplaceId: string
  marketplaceName: string
  marketplaceCode: string
  salesRevenue: number
  totalExpenses: number
  totalFees: number
  totalRefunds: number
  totalCOGS: number
  grossProfit: number
  netProfit: number
  grossMargin: number
  netMargin: number
  orderCount: number
}

/**
 * Time-series profit trend data
 * Used for chart visualization
 */
export interface ProfitTrendData {
  date: string
  period: string // 'day', 'week', 'month'
  salesRevenue: number
  totalExpenses: number
  totalFees: number
  totalRefunds: number
  totalCOGS: number
  grossProfit: number
  netProfit: number
  grossMargin: number
  netMargin: number
  orderCount: number
}

/**
 * Profit trends response
 * Time-series data for profit visualization
 */
export interface ProfitTrendsResponse {
  data: ProfitTrendData[]
  period: 'day' | 'week' | 'month'
  startDate: string
  endDate: string
}

/**
 * Profit breakdown response
 * Generic response for product or marketplace breakdowns
 */
export interface ProfitBreakdownResponse<T> {
  data: T[]
  summary: ProfitSummary
  totalRecords: number
}

