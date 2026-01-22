/**
 * COGS module types
 * Type definitions for Cost of Goods Sold calculations and management
 */

/**
 * Cost method enum
 * Defines how COGS is calculated
 */
export enum CostMethod {
  BATCH = 'BATCH',
  TIME_PERIOD = 'TIME_PERIOD',
  WEIGHTED_AVERAGE = 'WEIGHTED_AVERAGE',
}

/**
 * COGS entry
 * Represents a single COGS record
 */
export interface COGSEntry {
  id: string
  sku: string
  accountId: string
  marketplaceId: string | null
  batchId: string | null
  quantity: number
  unitCost: number
  totalCost: number
  costMethod: CostMethod
  shipmentCost: number | null
  purchaseDate: Date
  createdAt: Date
  updatedAt: Date
}

/**
 * Batch entry
 * Represents an inbound shipment batch
 */
export interface BatchEntry {
  id: string
  sku: string
  accountId: string
  quantity: number
  unitCost: number
  totalCost: number
  receivedAt: Date
  notes: string | null
  createdAt: Date
  updatedAt: Date
}

/**
 * Create COGS request
 */
export interface CreateCOGSRequest {
  sku: string
  accountId: string
  marketplaceId?: string
  batchId?: string
  quantity: number
  unitCost: number
  costMethod?: CostMethod
  shipmentCost?: number
  purchaseDate?: string
}

/**
 * Update COGS request
 */
export interface UpdateCOGSRequest {
  quantity?: number
  unitCost?: number
  shipmentCost?: number
  costMethod?: CostMethod
  purchaseDate?: string
}

/**
 * Create batch request
 */
export interface CreateBatchRequest {
  sku: string
  accountId: string
  quantity: number
  unitCost: number
  notes?: string
  receivedAt?: string
}

/**
 * COGS response
 */
export interface COGSResponse {
  id: string
  sku: string
  accountId: string
  marketplaceId: string | null
  batchId: string | null
  quantity: number
  unitCost: number
  totalCost: number
  costMethod: CostMethod
  shipmentCost: number | null
  purchaseDate: string
  createdAt: string
  updatedAt: string
}

/**
 * Batch response
 */
export interface BatchResponse {
  id: string
  sku: string
  accountId: string
  quantity: number
  unitCost: number
  totalCost: number
  receivedAt: string
  notes: string | null
  createdAt: string
  updatedAt: string
}

/**
 * COGS by SKU response
 * Aggregated COGS data for a specific SKU
 */
export interface COGSBySKUResponse {
  sku: string
  accountId: string
  totalQuantity: number
  averageUnitCost: number
  totalCost: number
  entries: COGSResponse[]
  byMarketplace: Array<{
    marketplaceId: string | null
    marketplaceName: string | null
    quantity: number
    totalCost: number
    averageUnitCost: number
  }>
}

/**
 * COGS historical response
 * Historical COGS data for reporting and trend analysis
 */
export interface COGSHistoricalResponse {
  sku?: string
  accountId: string
  marketplaceId?: string
  startDate: string
  endDate: string
  data: Array<{
    date: string
    quantity: number
    unitCost: number
    totalCost: number
    costMethod: CostMethod
    batchId: string | null
  }>
  summary: {
    totalQuantity: number
    averageUnitCost: number
    totalCost: number
    methodBreakdown: Record<CostMethod, number>
  }
}

/**
 * Batch details response
 * Detailed information about a batch including associated COGS
 */
export interface BatchDetailsResponse extends BatchResponse {
  cogsEntries: COGSResponse[]
  remainingQuantity: number
  usedQuantity: number
}

