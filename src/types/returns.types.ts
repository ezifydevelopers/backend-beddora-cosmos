export interface ReturnFilters {
  accountId?: string
  marketplaceId?: string
  sku?: string
  reasonCode?: string
  startDate?: string
  endDate?: string
  period?: 'day' | 'week' | 'month'
}

export interface ReturnInput {
  orderId: string
  sku: string
  accountId: string
  marketplaceId?: string
  quantityReturned: number
  reasonCode: string
  refundAmount: number
  feeAmount: number
  isSellable: boolean
}

export interface ReturnUpdateInput {
  sku?: string
  marketplaceId?: string
  quantityReturned?: number
  reasonCode?: string
  refundAmount?: number
  feeAmount?: number
  isSellable?: boolean
}

export interface ReturnSummary {
  totalReturnedUnits: number
  totalRefundAmount: number
  totalFeeAmount: number
  sellableUnits: number
  unsellableUnits: number
  lostUnits: number
  byReasonCode: Record<string, { units: number; refundAmount: number; feeAmount: number }>
  byMarketplace: Record<string, { units: number; refundAmount: number; feeAmount: number }>
  trends: Array<{
    period: string
    units: number
    refundAmount: number
    feeAmount: number
  }>
}

