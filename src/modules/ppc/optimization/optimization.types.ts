export interface PPCOptimizationFilters {
  accountId: string
  amazonAccountId?: string
  marketplaceId?: string
  campaignId?: string
  adGroupId?: string
  keyword?: string
  startDate?: string
  endDate?: string
}

export interface PPCOptimizationItem {
  id: string
  keyword: string
  matchType?: string | null
  adGroupId: string
  campaignId?: string | null
  spend: number
  sales: number
  acos: number
  roi: number
  targetAcos?: number | null
  targetProfitability?: number | null
  currentBid: number
  suggestedBid?: number | null
  optimizationMode: 'manual' | 'autoplay'
  status: 'active' | 'paused' | 'negative'
  lastOptimizedAt?: string | null
  suggestedAction?: string | null
}

export interface KeywordHarvestSuggestion {
  keyword: string
  action: 'positive' | 'negative' | 'add'
  reason: string
}

export interface PPCOptimizationSummary {
  totalKeywords: number
  autoplayKeywords: number
  manualKeywords: number
  suggestedChanges: number
  pausedKeywords: number
}

export interface PPCOptimizationStatusResponse {
  summary: PPCOptimizationSummary
  items: PPCOptimizationItem[]
  harvesting: KeywordHarvestSuggestion[]
}

export interface PPCOptimizationRunInput extends PPCOptimizationFilters {
  minBid?: number
  maxBid?: number
  pauseAcosThreshold?: number
  negativeAcosThreshold?: number
}

export interface PPCOptimizationRunResult {
  updated: number
  skipped: number
  applied: Array<{
    keywordId: string
    previousBid: number
    newBid: number
    reason: string
  }>
}

export interface PPCOptimizationHistoryItem {
  id: string
  keywordId: string
  keyword: string
  previousBid: number | null
  newBid: number | null
  reason: string
  createdAt: string
}

export interface PPCOptimizationHistoryResponse {
  data: PPCOptimizationHistoryItem[]
  total: number
}

