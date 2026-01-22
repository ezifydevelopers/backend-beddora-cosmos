export type StockStatus = 'low' | 'normal' | 'overstock'

export interface InventoryKpiFilters {
  accountId: string
  marketplaceId?: string
  sku?: string
  status?: StockStatus
}

export interface FifoBatchAssignment {
  batchId: string
  receivedAt: Date
  quantityAssigned: number
}

export interface InventoryKpiItem {
  id: string
  sku: string
  accountId: string
  marketplaceId?: string | null
  marketplace?: {
    id: string
    name: string
    code: string
  } | null
  daysOfStockLeft: number
  overstockRisk: boolean
  fifoBatchAssignments: FifoBatchAssignment[]
  lastCalculatedAt?: Date | null
  createdAt: Date
  updatedAt: Date
  status: StockStatus
}

export interface InventoryKpiResponse {
  data: InventoryKpiItem[]
  total: number
}

