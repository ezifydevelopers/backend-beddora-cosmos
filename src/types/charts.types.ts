export type ChartPeriod = 'day' | 'week' | 'month' | 'quarter' | 'year'

export type ChartMetric = 'profit' | 'sales' | 'ppc' | 'returns'

export interface ChartFilters {
  accountId?: string
  amazonAccountId?: string
  marketplaceId?: string
  sku?: string
  campaignId?: string
  startDate?: string
  endDate?: string
  period?: ChartPeriod
}

export interface ChartSeriesPoint {
  period: string
  value: number
}

export interface ChartSeries {
  label: string
  data: ChartSeriesPoint[]
}

export interface ChartResponse {
  metric: ChartMetric
  period: ChartPeriod
  startDate: string
  endDate: string
  series: ChartSeries[]
}

export interface ComparisonResponse {
  metric: ChartMetric
  period: ChartPeriod
  current: ChartSeries
  previous: ChartSeries
  currentRange: { startDate: string; endDate: string }
  previousRange: { startDate: string; endDate: string }
}

/**
 * Dashboard chart response
 * Returns multiple metrics for combination chart visualization
 */
export interface DashboardChartResponse {
  period: ChartPeriod
  startDate: string
  endDate: string
  data: Array<{
    period: string
    unitsSold: number
    advertisingCost: number
    refunds: number
    netProfit: number
  }>
}
