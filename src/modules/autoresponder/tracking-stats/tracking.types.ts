/**
 * Tracking & Stats Types
 * 
 * Defines types for email interaction tracking and review statistics.
 */

export type EmailEventType = 'open' | 'click' | 'bounce' | 'delivered'

export interface EmailInteractionMetadata {
  clickedLink?: string
  userAgent?: string
  ipAddress?: string
  location?: string
  device?: string
  [key: string]: any
}

export interface EmailInteraction {
  id: string
  emailQueueId: string
  eventType: EmailEventType
  timestamp: Date
  metadata: EmailInteractionMetadata | null
  createdAt: Date
}

export interface EmailStatsFilters {
  accountId?: string
  marketplaceId?: string
  templateId?: string
  productId?: string
  sku?: string
  startDate?: Date
  endDate?: Date
  purchaseType?: string
}

export interface EmailStatsResponse {
  totalSent: number
  totalDelivered: number
  totalOpened: number
  totalClicked: number
  totalBounced: number
  totalFailed: number
  openRate: number // percentage
  clickRate: number // percentage
  bounceRate: number // percentage
  deliveryRate: number // percentage
  byTemplate?: Array<{
    templateId: string
    templateName: string
    sent: number
    delivered: number
    opened: number
    clicked: number
    bounced: number
    openRate: number
    clickRate: number
  }>
  byDate?: Array<{
    date: string
    sent: number
    delivered: number
    opened: number
    clicked: number
  }>
  trends?: {
    openRateTrend: number[] // Array of percentages over time
    clickRateTrend: number[] // Array of percentages over time
  }
}

export interface ReviewResponseTimes {
  min: number // hours
  max: number // hours
  average: number // hours
}

export interface ReviewStats {
  id: string
  templateId: string
  userId: string
  accountId: string | null
  marketplaceId: string | null
  productId: string | null
  asin: string | null
  sku: string | null
  sentCount: number
  reviewReceivedCount: number
  positiveReviews: number
  negativeReviews: number
  responseTimes: ReviewResponseTimes | null
  lastUpdated: Date
  createdAt: Date
  updatedAt: Date
  template?: {
    id: string
    name: string
  }
  product?: {
    id: string
    title: string
    sku: string
  }
}

export interface ReviewStatsFilters {
  accountId?: string
  marketplaceId?: string
  templateId?: string
  productId?: string
  asin?: string
  sku?: string
  startDate?: Date
  endDate?: Date
}

export interface ReviewStatsResponse {
  totalSent: number
  totalReceived: number
  totalPositive: number
  totalNegative: number
  averageResponseTime: number // hours
  responseRate: number // percentage
  positiveRate: number // percentage
  byTemplate?: Array<{
    templateId: string
    templateName: string
    sent: number
    received: number
    positive: number
    negative: number
    responseRate: number
    positiveRate: number
  }>
  byProduct?: Array<{
    productId: string
    productTitle: string
    asin: string | null
    sku: string | null
    sent: number
    received: number
    positive: number
    negative: number
    responseRate: number
    positiveRate: number
  }>
  byDate?: Array<{
    date: string
    sent: number
    received: number
    positive: number
    negative: number
  }>
  trends?: {
    responseRateTrend: number[]
    positiveRateTrend: number[]
  }
}

export interface TrackEmailInteractionInput {
  emailQueueId: string
  eventType: EmailEventType
  metadata?: EmailInteractionMetadata
}

export interface UpdateReviewStatsInput {
  templateId: string
  userId: string
  accountId?: string
  marketplaceId?: string
  productId?: string
  asin?: string
  sku?: string
  reviewReceived?: boolean
  isPositive?: boolean
  responseTimeHours?: number
}

