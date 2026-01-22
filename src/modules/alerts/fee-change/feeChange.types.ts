export interface FeeChangeAlertFilters {
  marketplaceId?: string
  sku?: string
  feeType?: string
  status?: 'unread' | 'read' | 'resolved'
}

export interface FeeChangeAlertItem {
  id: string
  marketplaceId: string
  productId?: string | null
  sku?: string | null
  feeType: string
  previousFee?: number | null
  newFee?: number | null
  changePercentage?: number | null
  status: 'unread' | 'read' | 'resolved'
  timestamp: string
}

export interface FeeChangeAlertsResponse {
  data: FeeChangeAlertItem[]
  total: number
}

