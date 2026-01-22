export interface EmailTemplateInput {
  name: string
  subject: string
  body: string
  variables?: Record<string, string | number | boolean | null> | null
  marketplaceId?: string
  productId?: string
  sku?: string
  purchaseType?: string
}

export interface EmailSendInput {
  templateId: string
  recipientEmail: string
  scheduledAt?: string
  variables?: Record<string, string | number | boolean | null>
  eventKey?: string
}

export interface PurchaseEventInput {
  userId: string
  recipientEmail: string
  orderId: string
  orderDate: string
  marketplaceId?: string | null
  productId?: string | null
  sku?: string | null
  purchaseType?: string | null
  customerName?: string | null
  productTitle?: string | null
}

export interface EmailStatsResponse {
  totalSent: number
  totalPending: number
  totalFailed: number
  openRate: number
  clickRate: number
  responseRate: number
}

