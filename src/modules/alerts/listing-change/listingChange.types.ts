export interface ListingAlertFilters {
  marketplaceId?: string
  asin?: string
  sku?: string
  status?: 'unread' | 'read' | 'resolved'
}

export interface ListingAlertItem {
  id: string
  marketplaceId: string
  asin: string
  sku?: string | null
  previousTitle?: string | null
  newTitle?: string | null
  previousDescription?: string | null
  newDescription?: string | null
  previousImages?: any
  newImages?: any
  previousCategory?: string | null
  newCategory?: string | null
  newSellerDetected: boolean
  status: 'unread' | 'read' | 'resolved'
  timestamp: string
}

export interface ListingAlertsResponse {
  data: ListingAlertItem[]
  total: number
}

