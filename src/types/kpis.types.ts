/**
 * KPI module types
 * Type definitions for Key Performance Indicators
 */

/**
 * KPI filter parameters
 * Used to filter KPI calculations by various dimensions
 */
export interface KPIFilters {
  accountId?: string
  amazonAccountId?: string
  marketplaceId?: string
  sku?: string
  campaignId?: string
  adGroupId?: string
  keywordId?: string
  startDate?: string
  endDate?: string
  period?: 'day' | 'week' | 'month' | 'hour' | 'custom'
}

/**
 * Units sold KPI response
 * Aggregated units sold by product, marketplace, and period
 */
export interface UnitsSoldKPI {
  totalUnits: number
  breakdown: Array<{
    sku?: string
    productId?: string
    productTitle?: string
    marketplaceId?: string
    marketplaceName?: string
    period: string
    units: number
    orderCount: number
  }>
  period: {
    startDate: string | null
    endDate: string | null
  }
}

/**
 * Returns cost breakdown
 * Returns aggregated by reason code, SKU, and marketplace
 */
export interface ReturnsCostKPI {
  totalReturnsCost: number
  totalReturnsCount: number
  breakdown: Array<{
    reasonCode: string | null
    reason: string | null
    sku?: string
    productId?: string
    productTitle?: string
    marketplaceId?: string
    marketplaceName?: string
    amount: number
    count: number
  }>
  period: {
    startDate: string | null
    endDate: string | null
  }
}

/**
 * Advertising cost (PPC) breakdown
 * PPC spend by campaign, ad group, and keyword
 */
export interface AdvertisingCostKPI {
  totalSpend: number
  totalSales: number
  averageACOS: number
  breakdown: Array<{
    campaignId: string
    campaignName?: string
    adGroupId?: string
    adGroupName?: string
    keywordId?: string
    keywordText?: string
    spend: number
    sales: number
    clicks: number
    impressions: number
    acos: number | null
    roas: number | null
  }>
  period: {
    startDate: string | null
    endDate: string | null
  }
}

/**
 * FBA fees breakdown
 * Aggregated FBA fees by period and fee type
 */
export interface FBAFeesKPI {
  totalFBAFees: number
  breakdown: Array<{
    period: string
    feeType: string
    amount: number
    orderCount: number
  }>
  period: {
    startDate: string | null
    endDate: string | null
    granularity: 'hour' | 'day' | 'week' | 'month'
  }
}

/**
 * Payout estimate
 * Estimated payouts after deductions, fees, and refunds
 */
export interface PayoutEstimateKPI {
  estimatedPayout: number
  grossRevenue: number
  totalDeductions: number
  breakdown: {
    fees: number
    refunds: number
    returns: number
    advertising: number
    fbaFees: number
    other: number
  }
  period: {
    startDate: string | null
    endDate: string | null
  }
}

