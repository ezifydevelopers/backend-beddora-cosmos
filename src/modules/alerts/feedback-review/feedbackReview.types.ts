export interface FeedbackReviewAlertFilters {
  marketplaceId?: string
  asin?: string
  sku?: string
  rating?: number
  status?: 'unread' | 'read' | 'resolved'
}

export interface FeedbackReviewAlertItem {
  id: string
  marketplaceId: string
  asin?: string | null
  productId?: string | null
  sku?: string | null
  previousRating?: number | null
  newRating?: number | null
  reviewText?: string | null
  reviewer?: string | null
  status: 'unread' | 'read' | 'resolved'
  timestamp: string
}

export interface FeedbackReviewAlertsResponse {
  data: FeedbackReviewAlertItem[]
  total: number
}

