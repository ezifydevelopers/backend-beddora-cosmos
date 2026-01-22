export interface PPCMetricsFilters {
  accountId: string
  amazonAccountId?: string
  marketplaceId?: string
  sku?: string
  startDate?: string
  endDate?: string
  period?: 'day' | 'week' | 'month'
}

export interface PPCMetricsOverview {
  totalSpend: number
  totalSales: number
  acos: number
  roi: number
  trend: Array<{
    date: string
    spend: number
    sales: number
    acos: number
    roi: number
  }>
}

export interface PPCMetricsItem {
  id: string
  name: string
  spend: number
  sales: number
  acos: number
  roi: number
}

export interface PPCMetricsResponse {
  data: PPCMetricsItem[]
  total: number
}

