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

/**
 * Order item-level profit breakdown
 * Profit metrics for individual order items
 */
export interface OrderItemProfitBreakdown {
  id: string
  orderId: string
  orderNumber: string
  orderDate: string
  orderStatus: string
  shipDate?: string | null
  marketplace: string
  marketplaceCode: string
  productId: string
  sku: string
  productTitle: string | null
  productImageUrl: string | null
  unitPrice: number
  quantity: number
  salesRevenue: number
  refundCount: number
  sellableReturnsPercent: number
  amazonFees: number
  cogs: number
  grossProfit: number
  expenses: number
  netProfit: number
  coupon?: string | null
  comment?: string | null
  currency: string
}

/**
 * P&L metric value for a specific period
 */
export interface PLPeriodValue {
  period: string // e.g., "2026-01", "2026-01-19" for month-to-date
  value: number
}

/**
 * P&L metric row
 * Represents a single metric row in the P&L table
 */
export interface PLMetricRow {
  parameter: string
  isExpandable: boolean
  periods: PLPeriodValue[]
  total: number
  children?: PLMetricRow[] // Child metrics for expandable rows
}

/**
 * P&L response
 * Contains all P&L metrics grouped by periods
 */
export interface PLResponse {
  periods: string[] // List of period labels (e.g., ["1-19 January 2026", "December", "November", ...])
  currentPeriod: string // Current period label
  metrics: PLMetricRow[]
  startDate: string
  endDate: string
}

/**
 * Country-level profit breakdown
 * Profit metrics grouped by country/region
 * Used for map visualization
 */
export interface CountryProfitBreakdown {
  country: string // Country code (e.g., "US", "UK", "DE")
  profit: number // Net profit for the country
  orders: number // Number of orders for the country
}

/**
 * Simplified profit trends response
 * Used for Trends screen with simplified chart data format
 * 
 * This format is optimized for frontend chart libraries
 * and can be easily consumed by microservices
 */
export interface ProfitTrendsSimpleResponse {
  labels: string[] // Date labels (e.g., ["2026-01-01", "2026-01-02"])
  profit: number[] // Net profit values for each period
  revenue: number[] // Sales revenue values for each period
}

/**
 * Product trend data for a specific date
 * Used in ProductTrendsResponse
 */
export interface ProductTrendDateValue {
  date: string // Date in ISO format (YYYY-MM-DD)
  value: number // Metric value for this date
  changePercent: number // Percentage change from previous date
}

/**
 * Product-level trends response
 * Used for Trends screen showing product-level metrics over time
 * 
 * Each product has daily values for the selected metric
 */
export interface ProductTrendsResponse {
  products: Array<{
    productId: string
    sku: string
    productTitle: string | null
    productImageUrl: string | null
    dailyValues: ProductTrendDateValue[] // Values for each date in the range
    chartData: number[] // Simplified data for chart visualization
  }>
  dates: string[] // All dates in the range (YYYY-MM-DD format)
  metric: string // The metric being displayed (e.g., 'sales', 'units', 'orders')
}
