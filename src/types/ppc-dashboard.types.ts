export interface PPCDashboardFilters {
  accountId?: string
  amazonAccountId?: string
  marketplaceId?: string
  sku?: string
  startDate?: string
  endDate?: string
  period?: 'day' | 'week' | 'month'
}

export interface PPCOverview {
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

export interface PPCCampaignItem {
  id: string
  campaignName: string
  status: string
  totalSpend: number
  totalSales: number
  acos: number
  roi: number
}

export interface PPCAdGroupItem {
  id: string
  campaignId: string
  adGroupName: string
  spend: number
  sales: number
  acos: number
  roi: number
}

export interface PPCKeywordItem {
  id: string
  adGroupId: string
  keyword: string
  matchType?: string | null
  spend: number
  sales: number
  acos: number
  roi: number
}

export interface PPCListResponse<T> {
  data: T[]
  total: number
}

