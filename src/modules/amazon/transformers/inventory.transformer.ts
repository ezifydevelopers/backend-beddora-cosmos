/**
 * Inventory Transformers
 * 
 * Utilities for transforming Amazon SP-API Inventory responses
 */

import {
  parseDate,
  parseIntSafe,
  normalizeString,
  normalizeSKU,
  normalizeASIN,
} from './common.transformer'

/**
 * Amazon SP-API Inventory Summary structure
 */
export interface AmazonInventorySummary {
  sellerSku?: string
  fnSku?: string
  asin?: string
  condition?: string
  totalQuantity?: number
  fulfillableQuantity?: number
  inboundWorkingQuantity?: number
  inboundShippedQuantity?: number
  inboundReceivingQuantity?: number
  reservedQuantity?: {
    pendingCustomerOrderQuantity?: number
    pendingTransshipmentQuantity?: number
    fcProcessingQuantity?: number
  }
  unfulfillableQuantity?: {
    totalUnfulfillableQuantity?: number
    customerDamagedQuantity?: number
    warehouseDamagedQuantity?: number
    distributorDamagedQuantity?: number
    carrierDamagedQuantity?: number
    defectiveQuantity?: number
    expiredQuantity?: number
  }
  lastUpdatedTime?: string
  [key: string]: any
}

/**
 * Transformed inventory data
 */
export interface TransformedInventory {
  sku: string
  asin: string | null
  condition: string | null
  fulfillable: number
  inbound: number
  reserved: number
  unfulfillable: number
  total: number
  lastUpdated: Date | null
  // Detailed breakdowns
  inboundBreakdown: {
    working: number
    shipped: number
    receiving: number
  }
  reservedBreakdown: {
    pendingCustomerOrder: number
    pendingTransshipment: number
    fcProcessing: number
  }
  unfulfillableBreakdown: {
    customerDamaged: number
    warehouseDamaged: number
    distributorDamaged: number
    carrierDamaged: number
    defective: number
    expired: number
  }
}

/**
 * Transform Amazon Inventory Summary to internal format
 * 
 * @param summary - Amazon Inventory Summary
 * @returns Transformed inventory data
 */
export function transformInventorySummary(
  summary: AmazonInventorySummary
): TransformedInventory {
  const sku = normalizeSKU(summary.sellerSku || summary.fnSku) || ''
  const asin = normalizeASIN(summary.asin)
  const condition = normalizeString(summary.condition)

  // Calculate inbound total
  const inbound =
    parseIntSafe(summary.inboundWorkingQuantity) +
    parseIntSafe(summary.inboundShippedQuantity) +
    parseIntSafe(summary.inboundReceivingQuantity)

  // Calculate reserved total
  const reservedQuantity = summary.reservedQuantity || {}
  const reserved =
    parseIntSafe(reservedQuantity.pendingCustomerOrderQuantity) +
    parseIntSafe(reservedQuantity.pendingTransshipmentQuantity) +
    parseIntSafe(reservedQuantity.fcProcessingQuantity)

  // Calculate unfulfillable total
  const unfulfillableQuantity = summary.unfulfillableQuantity || {}
  const unfulfillable = parseIntSafe(unfulfillableQuantity.totalUnfulfillableQuantity)

  return {
    sku,
    asin,
    condition,
    fulfillable: parseIntSafe(summary.fulfillableQuantity),
    inbound,
    reserved,
    unfulfillable,
    total: parseIntSafe(summary.totalQuantity),
    lastUpdated: parseDate(summary.lastUpdatedTime),
    inboundBreakdown: {
      working: parseIntSafe(summary.inboundWorkingQuantity),
      shipped: parseIntSafe(summary.inboundShippedQuantity),
      receiving: parseIntSafe(summary.inboundReceivingQuantity),
    },
    reservedBreakdown: {
      pendingCustomerOrder: parseIntSafe(reservedQuantity.pendingCustomerOrderQuantity),
      pendingTransshipment: parseIntSafe(reservedQuantity.pendingTransshipmentQuantity),
      fcProcessing: parseIntSafe(reservedQuantity.fcProcessingQuantity),
    },
    unfulfillableBreakdown: {
      customerDamaged: parseIntSafe(unfulfillableQuantity.customerDamagedQuantity),
      warehouseDamaged: parseIntSafe(unfulfillableQuantity.warehouseDamagedQuantity),
      distributorDamaged: parseIntSafe(unfulfillableQuantity.distributorDamagedQuantity),
      carrierDamaged: parseIntSafe(unfulfillableQuantity.carrierDamagedQuantity),
      defective: parseIntSafe(unfulfillableQuantity.defectiveQuantity),
      expired: parseIntSafe(unfulfillableQuantity.expiredQuantity),
    },
  }
}

/**
 * Transform array of inventory summaries
 * 
 * @param summaries - Array of inventory summaries
 * @returns Array of transformed inventory data
 */
export function transformInventorySummaries(
  summaries?: AmazonInventorySummary[] | null
): TransformedInventory[] {
  if (!summaries || !Array.isArray(summaries)) return []
  return summaries.map(transformInventorySummary)
}
