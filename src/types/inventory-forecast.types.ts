export interface InventoryForecastFilters {
  accountId: string
  marketplaceId?: string
  sku?: string
}

export interface InventoryForecastItem {
  id: string
  sku: string
  accountId: string
  marketplaceId?: string | null
  marketplace?: {
    id: string
    name: string
    code: string
  } | null
  currentStock: number
  salesVelocity: number
  forecast3Day: number
  forecast7Day: number
  forecast30Day: number
  restockThreshold: number
  alertSent: boolean
  lastCalculatedAt?: Date | null
  createdAt: Date
  updatedAt: Date
  suggestedReorderQty: number
}

export interface InventoryForecastResponse {
  data: InventoryForecastItem[]
  total: number
}

export interface InventoryForecastAlert {
  sku: string
  marketplaceId?: string | null
  marketplace?: {
    id: string
    name: string
    code: string
  } | null
  currentStock: number
  forecast7Day: number
  forecast30Day: number
  restockThreshold: number
  suggestedReorderQty: number
}

export interface InventoryForecastAlertsResponse {
  alerts: InventoryForecastAlert[]
  total: number
}

