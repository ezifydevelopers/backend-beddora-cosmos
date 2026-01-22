export type StockStatus = 'low' | 'normal' | 'out_of_stock'

export interface InventoryStockFilters {
  accountId: string
  marketplaceId?: string
  sku?: string
  status?: StockStatus
  page?: number
  limit?: number
  includePendingShipments?: boolean
}

export interface MarketplaceSummary {
  marketplaceId: string | null
  marketplaceName?: string | null
  marketplaceCode?: string | null
  totalStock: number
  lowStockCount: number
  outOfStockCount: number
}

export interface InventoryStockSummary {
  totalStock: number
  totalReserved: number
  lowStockCount: number
  outOfStockCount: number
  marketplaceSummary: MarketplaceSummary[]
  pendingShipments?: number
}

export interface InventoryStockItem {
  id: string
  sku: string
  accountId: string
  marketplaceId?: string | null
  marketplace?: {
    id: string
    name: string
    code: string
  } | null
  quantityAvailable: number
  quantityReserved: number
  lowStockThreshold: number
  lastSyncedAt?: Date | null
  createdAt: Date
  updatedAt: Date
  status: StockStatus
}

export interface InventoryStockResponse {
  data: InventoryStockItem[]
  summary: InventoryStockSummary
  total: number
  page: number
  limit: number
}

export interface InventoryStockAlert {
  sku: string
  marketplaceId?: string | null
  marketplace?: {
    id: string
    name: string
    code: string
  } | null
  quantityAvailable: number
  lowStockThreshold: number
  status: StockStatus
}

export interface InventoryStockAlertsResponse {
  alerts: InventoryStockAlert[]
  total: number
}

