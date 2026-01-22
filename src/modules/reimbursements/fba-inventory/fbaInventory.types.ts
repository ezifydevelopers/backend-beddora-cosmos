/**
 * FBA Inventory Alert Types
 * 
 * Defines types for FBA lost and damaged inventory detection and alerts.
 */

export type FbaAlertType = 'lost' | 'damaged'
export type FbaAlertStatus = 'pending' | 'reimbursed' | 'ignored' | 'disputed'

export interface FbaInventoryAlert {
  id: string
  userId: string
  accountId: string | null
  marketplaceId: string
  productId: string | null
  sku: string | null
  alertType: FbaAlertType
  reportedQuantity: number
  reimbursedQuantity: number
  estimatedAmount: number
  status: FbaAlertStatus
  notes: string | null
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

export interface FbaInventoryAlertInput {
  marketplaceId: string
  productId?: string
  sku?: string
  alertType: FbaAlertType
  reportedQuantity: number
  reimbursedQuantity?: number
  estimatedAmount: number
  notes?: string
}

export interface FbaInventoryAlertUpdate {
  status?: FbaAlertStatus
  reimbursedQuantity?: number
  notes?: string
}

export interface FbaInventoryAlertFilters {
  accountId?: string
  marketplaceId?: string
  productId?: string
  sku?: string
  alertType?: FbaAlertType
  status?: FbaAlertStatus
  startDate?: Date
  endDate?: Date
}

export interface FbaInventoryAlertResponse {
  alerts: FbaInventoryAlert[]
  summary: {
    totalPending: number
    totalReimbursed: number
    totalIgnored: number
    totalDisputed: number
    totalEstimatedAmount: number
    totalReimbursedAmount: number
  }
}

export interface CalculateEstimatedAmountParams {
  productId?: string
  sku?: string
  quantity: number
  alertType: FbaAlertType
  cost?: number
  fees?: number
}

