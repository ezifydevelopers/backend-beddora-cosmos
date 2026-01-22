/**
 * Refund Discrepancy Types
 *
 * Defines types for refund discrepancies detection and resolution.
 */

export type RefundDiscrepancyStatus = 'pending' | 'reconciled' | 'ignored'

export interface RefundDiscrepancy {
  id: string
  userId: string
  accountId: string | null
  marketplaceId: string
  productId: string | null
  sku: string | null
  refundQuantity: number
  returnedQuantity: number
  unreimbursedAmount: number
  refundReasonCode: string | null
  status: RefundDiscrepancyStatus
  detectedAt: Date
  resolvedAt: Date | null
  createdAt: Date
  updatedAt: Date
  marketplace?: {
    id: string
    name: string
  }
  product?: {
    id: string
    title: string
    sku: string
    cost: number
  }
}

export interface RefundDiscrepancyInput {
  marketplaceId: string
  productId?: string
  sku?: string
  refundQuantity: number
  returnedQuantity: number
  unreimbursedAmount?: number
  refundReasonCode?: string
}

export interface RefundDiscrepancyUpdate {
  status?: RefundDiscrepancyStatus
  notes?: string
}

export interface RefundDiscrepancyFilters {
  accountId?: string
  marketplaceId?: string
  productId?: string
  sku?: string
  refundReasonCode?: string
  status?: RefundDiscrepancyStatus
  startDate?: Date
  endDate?: Date
}

export interface RefundDiscrepancyResponse {
  discrepancies: RefundDiscrepancy[]
  summary: {
    totalPending: number
    totalReconciled: number
    totalIgnored: number
    totalUnreimbursedAmount: number
  }
}

export interface RefundDiscrepancyHistoryEntry {
  id: string
  discrepancyId: string
  userId: string
  previousStatus: string | null
  newStatus: string
  notes: string | null
  changedAt: Date
}

