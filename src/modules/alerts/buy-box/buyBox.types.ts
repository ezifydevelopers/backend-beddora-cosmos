export interface BuyBoxAlertFilters {
  marketplaceId?: string
  asin?: string
  sku?: string
  status?: 'unread' | 'read' | 'resolved'
}

export interface BuyBoxAlertItem {
  id: string
  marketplaceId: string
  asin: string
  sku?: string | null
  lostBuyBox: boolean
  previousPrice?: number | null
  newPrice?: number | null
  competitorChanges?: any
  status: 'unread' | 'read' | 'resolved'
  timestamp: string
}

export interface BuyBoxAlertsResponse {
  data: BuyBoxAlertItem[]
  total: number
}

