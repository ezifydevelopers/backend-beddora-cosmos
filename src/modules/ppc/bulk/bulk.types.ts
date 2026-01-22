export type BulkTargetType = 'campaign' | 'adGroup' | 'keyword'
export type BulkActionType = 'bidUpdate' | 'statusChange' | 'recommendation' | 'revert'

export interface BulkBaseInput {
  accountId: string
  marketplaceId?: string
  amazonAccountId?: string
  campaignId?: string
  adGroupId?: string
  keyword?: string
  sku?: string
  targetType?: BulkTargetType
  targetIds?: string[]
  preview?: boolean
}

export interface BulkBidUpdateInput extends BulkBaseInput {
  newBid: number
  minBid?: number
  maxBid?: number
  reason?: string
}

export interface BulkStatusChangeInput extends BulkBaseInput {
  status: 'active' | 'paused' | 'negative'
  reason?: string
}

export interface BulkApplyRecommendationsInput extends BulkBaseInput {
  minBid?: number
  maxBid?: number
  reason?: string
}

export interface BulkRevertInput {
  accountId: string
  historyId: string
}

export interface BulkPreviewItem {
  keywordId: string
  keyword: string
  currentBid?: number
  newBid?: number
  currentStatus?: string
  newStatus?: string
}

export interface BulkActionResult {
  preview: boolean
  applied: number
  skipped: number
  items: BulkPreviewItem[]
  historyId?: string
}

export interface BulkHistoryItem {
  id: string
  actionType: string
  targetType: string
  targetIds: string[]
  oldValues: any
  newValues: any
  createdAt: string
  userId: string
}

export interface BulkHistoryResponse {
  data: BulkHistoryItem[]
  total: number
}

