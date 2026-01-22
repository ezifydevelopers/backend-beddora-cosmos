export interface PPCProfitMetricsFilters {
  accountId: string
  amazonAccountId?: string
  marketplaceId?: string
  sku?: string
  startDate?: string
  endDate?: string
  period?: 'day' | 'week' | 'month'
}

export interface PPCProfitOverview {
  totalSpend: number
  totalSales: number
  breakEvenAcos: number
  estimatedProfit: number
  suggestedBid: number
  trend: Array<{
    date: string
    spend: number
    sales: number
    breakEvenAcos: number
    estimatedProfit: number
    suggestedBid: number
  }>
}

export interface PPCProfitMetricsItem {
  id: string
  name: string
  spend: number
  sales: number
  breakEvenAcos: number
  estimatedProfit: number
  suggestedBid: number
}

export interface PPCProfitMetricsResponse {
  data: PPCProfitMetricsItem[]
  total: number
}

