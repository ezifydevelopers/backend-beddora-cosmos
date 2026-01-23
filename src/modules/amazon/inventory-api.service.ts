/**
 * Inventory API Service
 * 
 * Handles Amazon SP-API FBA Inventory operations:
 * - Inventory Summaries - Get inventory levels and status
 * - Inventory Items - Get detailed inventory item information
 * - Inventory Health - Get inventory health metrics
 * - Inventory Adjustments - Track inventory adjustments
 * 
 * The Inventory API provides:
 * - FBA inventory levels (fulfillable, inbound, reserved, etc.)
 * - Inventory health metrics (age, sell-through rate, etc.)
 * - Inventory adjustments and corrections
 * - Multi-warehouse inventory tracking
 * - Inventory alerts and notifications
 * 
 * Architecture:
 * - Uses SPAPIWrapper for authentication
 * - Handles pagination automatically
 * - Parses inventory data into structured format
 * - Can be extracted to separate microservice
 */

import { logger } from '../../config/logger'
import { AppError } from '../../middlewares/error.middleware'
import { SPAPIWrapper } from './sp-api-wrapper.service'

/**
 * Inventory Summary
 */
export interface InventorySummary {
  asin?: string
  fnSku?: string
  sellerSku?: string
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
  researchingQuantity?: number
  unfulfillableQuantity?: {
    totalUnfulfillableQuantity?: number
    customerDamagedQuantity?: number
    warehouseDamagedQuantity?: number
    distributorDamagedQuantity?: number
    carrierDamagedQuantity?: number
    defectiveQuantity?: number
    expiredQuantity?: number
  }
  futureSupplyArrival?: Array<{
    supplyType?: string
    quantity?: number
    earliestArrival?: string
    latestArrival?: string
  }>
  detailedQuantity?: {
    fulfillmentChannel?: string
    quantity?: number
  }[]
  lastUpdatedTime?: string
}

/**
 * Inventory Summaries Response
 */
export interface InventorySummariesResponse {
  payload?: {
    granularity?: {
      granularityType?: string
      granularityId?: string
    }
    inventorySummaries?: InventorySummary[]
    nextToken?: string
  }
  errors?: any[]
  pagination?: {
    nextToken?: string
  }
}

/**
 * Inventory Item Detail
 */
export interface InventoryItem {
  sellerSku?: string
  fnSku?: string
  asin?: string
  productName?: string
  condition?: string
  totalQuantity?: number
  quantityBreakdown?: {
    fnSku?: string
    quantity?: number
    fulfillmentChannel?: string
  }[]
  lastUpdatedTime?: string
}

/**
 * Inventory Items Response
 */
export interface InventoryItemsResponse {
  payload?: {
    pagination?: {
      nextToken?: string
    }
    inventoryItems?: InventoryItem[]
  }
  errors?: any[]
}

/**
 * Inventory Health
 */
export interface InventoryHealth {
  sellerSku?: string
  fnSku?: string
  asin?: string
  productName?: string
  totalQuantity?: number
  totalValue?: {
    amount?: number
    currencyCode?: string
  }
  daysOfSupply?: number
  sellThroughRate?: number
  estimatedExcessQuantity?: number
  estimatedExcessValue?: {
    amount?: number
    currencyCode?: string
  }
  recommendedReplenishmentQuantity?: number
  inboundQuantity?: number
  reservedQuantity?: number
  unfulfillableQuantity?: number
  availableQuantity?: number
  age?: number
  lastUpdatedTime?: string
}

/**
 * Inventory Health Response
 */
export interface InventoryHealthResponse {
  payload?: {
    inventoryHealth?: InventoryHealth[]
    pagination?: {
      nextToken?: string
    }
  }
  errors?: any[]
}

/**
 * Get inventory summaries
 * 
 * Returns inventory summaries for FBA inventory across marketplaces.
 * 
 * @param amazonAccountId - Amazon account ID
 * @param marketplaceIds - Marketplace IDs (defaults to account's marketplaces)
 * @param details - Include detailed quantity breakdown (default: true)
 * @param granularityType - Granularity type: Marketplace, Warehouse, or SKU (default: Marketplace)
 * @param granularityId - Granularity ID (marketplace ID, warehouse ID, or SKU)
 * @param nextToken - Pagination token
 * @returns Inventory summaries
 */
export async function getInventorySummaries(
  amazonAccountId: string,
  marketplaceIds?: string[],
  details: boolean = true,
  granularityType: string = 'Marketplace',
  granularityId?: string,
  nextToken?: string
): Promise<InventorySummariesResponse> {
  try {
    const client = new SPAPIWrapper(amazonAccountId)
    await client.initialize()

    if (!marketplaceIds || marketplaceIds.length === 0) {
      // Get marketplace IDs from account if not provided
      const prisma = (await import('../../config/db')).default
      const account = await prisma.amazonAccount.findUnique({
        where: { id: amazonAccountId },
        select: { marketplaceIds: true },
      })
      marketplaceIds = account?.marketplaceIds && account.marketplaceIds.length > 0 
        ? account.marketplaceIds 
        : ['ATVPDKIKX0DER'] // Default to US
    }

    // Use first marketplace as granularity ID if not provided
    if (!granularityId && granularityType === 'Marketplace') {
      granularityId = marketplaceIds[0]
    }

    const params: any = {
      marketplaceIds: marketplaceIds.join(','),
      details: details.toString(),
      granularityType,
    }

    if (granularityId) {
      params.granularityId = granularityId
    }

    if (nextToken) {
      params.nextToken = nextToken
    }

    const response = await client.get<InventorySummariesResponse>(
      '/fba/inventory/v1/summaries',
      params
    )

    logger.debug('Retrieved inventory summaries', {
      amazonAccountId,
      marketplaceCount: marketplaceIds.length,
      summaryCount: response.payload?.inventorySummaries?.length || 0,
      hasNextToken: !!response.payload?.nextToken,
    })

    return response
  } catch (error) {
    logger.error('Failed to retrieve inventory summaries', {
      amazonAccountId,
      error: (error as Error).message,
    })
    throw new AppError('Failed to retrieve inventory summaries from Amazon', 500)
  }
}

/**
 * Get all inventory summaries (handles pagination automatically)
 * 
 * @param amazonAccountId - Amazon account ID
 * @param marketplaceIds - Marketplace IDs
 * @param details - Include detailed quantity breakdown
 * @param granularityType - Granularity type
 * @param granularityId - Granularity ID
 * @returns All inventory summaries (paginated results combined)
 */
export async function getAllInventorySummaries(
  amazonAccountId: string,
  marketplaceIds?: string[],
  details: boolean = true,
  granularityType: string = 'Marketplace',
  granularityId?: string
): Promise<InventorySummary[]> {
  const allSummaries: InventorySummary[] = []
  let nextToken: string | undefined

  do {
    const response = await getInventorySummaries(
      amazonAccountId,
      marketplaceIds,
      details,
      granularityType,
      granularityId,
      nextToken
    )

    if (response.payload?.inventorySummaries) {
      allSummaries.push(...response.payload.inventorySummaries)
    }

    nextToken = response.payload?.nextToken
  } while (nextToken)

  logger.info('Retrieved all inventory summaries', {
    amazonAccountId,
    totalSummaries: allSummaries.length,
  })

  return allSummaries
}

/**
 * Get inventory items (detailed)
 * 
 * Returns detailed inventory item information including quantity breakdown by fulfillment channel.
 * 
 * @param amazonAccountId - Amazon account ID
 * @param marketplaceIds - Marketplace IDs
 * @param sellerSkus - Optional array of seller SKUs to filter by
 * @param nextToken - Pagination token
 * @returns Inventory items
 */
export async function getInventoryItems(
  amazonAccountId: string,
  marketplaceIds?: string[],
  sellerSkus?: string[],
  nextToken?: string
): Promise<InventoryItemsResponse> {
  try {
    const client = new SPAPIWrapper(amazonAccountId)
    await client.initialize()

    if (!marketplaceIds || marketplaceIds.length === 0) {
      const prisma = (await import('../../config/db')).default
      const account = await prisma.amazonAccount.findUnique({
        where: { id: amazonAccountId },
        select: { marketplaceIds: true },
      })
      marketplaceIds = account?.marketplaceIds && account.marketplaceIds.length > 0 
        ? account.marketplaceIds 
        : ['ATVPDKIKX0DER']
    }

    const params: any = {
      marketplaceIds: marketplaceIds.join(','),
    }

    if (sellerSkus && sellerSkus.length > 0) {
      params.sellerSkus = sellerSkus.join(',')
    }

    if (nextToken) {
      params.nextToken = nextToken
    }

    const response = await client.get<InventoryItemsResponse>(
      '/fba/inventory/v1/items',
      params
    )

    logger.debug('Retrieved inventory items', {
      amazonAccountId,
      skuCount: sellerSkus?.length || 0,
      itemCount: response.payload?.inventoryItems?.length || 0,
      hasNextToken: !!response.payload?.pagination?.nextToken,
    })

    return response
  } catch (error) {
    logger.error('Failed to retrieve inventory items', {
      amazonAccountId,
      error: (error as Error).message,
    })
    throw new AppError('Failed to retrieve inventory items from Amazon', 500)
  }
}

/**
 * Get all inventory items (handles pagination automatically)
 * 
 * @param amazonAccountId - Amazon account ID
 * @param marketplaceIds - Marketplace IDs
 * @param sellerSkus - Optional array of seller SKUs to filter by
 * @returns All inventory items (paginated results combined)
 */
export async function getAllInventoryItems(
  amazonAccountId: string,
  marketplaceIds?: string[],
  sellerSkus?: string[]
): Promise<InventoryItem[]> {
  const allItems: InventoryItem[] = []
  let nextToken: string | undefined

  do {
    const response = await getInventoryItems(
      amazonAccountId,
      marketplaceIds,
      sellerSkus,
      nextToken
    )

    if (response.payload?.inventoryItems) {
      allItems.push(...response.payload.inventoryItems)
    }

    nextToken = response.payload?.pagination?.nextToken
  } while (nextToken)

  logger.info('Retrieved all inventory items', {
    amazonAccountId,
    totalItems: allItems.length,
  })

  return allItems
}

/**
 * Get inventory health metrics
 * 
 * Returns inventory health metrics including days of supply, sell-through rate, and excess inventory.
 * 
 * @param amazonAccountId - Amazon account ID
 * @param marketplaceIds - Marketplace IDs
 * @param sellerSkus - Optional array of seller SKUs to filter by
 * @param nextToken - Pagination token
 * @returns Inventory health metrics
 */
export async function getInventoryHealth(
  amazonAccountId: string,
  marketplaceIds?: string[],
  sellerSkus?: string[],
  nextToken?: string
): Promise<InventoryHealthResponse> {
  try {
    const client = new SPAPIWrapper(amazonAccountId)
    await client.initialize()

    if (!marketplaceIds || marketplaceIds.length === 0) {
      const prisma = (await import('../../config/db')).default
      const account = await prisma.amazonAccount.findUnique({
        where: { id: amazonAccountId },
        select: { marketplaceIds: true },
      })
      marketplaceIds = account?.marketplaceIds && account.marketplaceIds.length > 0 
        ? account.marketplaceIds 
        : ['ATVPDKIKX0DER']
    }

    const params: any = {
      marketplaceIds: marketplaceIds.join(','),
    }

    if (sellerSkus && sellerSkus.length > 0) {
      params.sellerSkus = sellerSkus.join(',')
    }

    if (nextToken) {
      params.nextToken = nextToken
    }

    const response = await client.get<InventoryHealthResponse>(
      '/fba/inventory/v1/health',
      params
    )

    logger.debug('Retrieved inventory health', {
      amazonAccountId,
      skuCount: sellerSkus?.length || 0,
      healthCount: response.payload?.inventoryHealth?.length || 0,
      hasNextToken: !!response.payload?.pagination?.nextToken,
    })

    return response
  } catch (error) {
    logger.error('Failed to retrieve inventory health', {
      amazonAccountId,
      error: (error as Error).message,
    })
    throw new AppError('Failed to retrieve inventory health from Amazon', 500)
  }
}

/**
 * Get all inventory health metrics (handles pagination automatically)
 * 
 * @param amazonAccountId - Amazon account ID
 * @param marketplaceIds - Marketplace IDs
 * @param sellerSkus - Optional array of seller SKUs to filter by
 * @returns All inventory health metrics (paginated results combined)
 */
export async function getAllInventoryHealth(
  amazonAccountId: string,
  marketplaceIds?: string[],
  sellerSkus?: string[]
): Promise<InventoryHealth[]> {
  const allHealth: InventoryHealth[] = []
  let nextToken: string | undefined

  do {
    const response = await getInventoryHealth(
      amazonAccountId,
      marketplaceIds,
      sellerSkus,
      nextToken
    )

    if (response.payload?.inventoryHealth) {
      allHealth.push(...response.payload.inventoryHealth)
    }

    nextToken = response.payload?.pagination?.nextToken
  } while (nextToken)

  logger.info('Retrieved all inventory health metrics', {
    amazonAccountId,
    totalHealth: allHealth.length,
  })

  return allHealth
}

/**
 * Get inventory by SKU
 * 
 * Convenience function to get inventory summary for specific SKUs.
 * 
 * @param amazonAccountId - Amazon account ID
 * @param sellerSkus - Array of seller SKUs
 * @param marketplaceIds - Marketplace IDs
 * @param details - Include detailed quantity breakdown
 * @returns Inventory summaries for specified SKUs
 */
export async function getInventoryBySKU(
  amazonAccountId: string,
  sellerSkus: string[],
  marketplaceIds?: string[],
  details: boolean = true
): Promise<InventorySummary[]> {
  try {
    // Get all summaries and filter by SKU
    const allSummaries = await getAllInventorySummaries(
      amazonAccountId,
      marketplaceIds,
      details,
      'SKU'
    )

    // Filter by requested SKUs
    const filtered = allSummaries.filter((summary) => 
      summary.sellerSku && sellerSkus.includes(summary.sellerSku)
    )

    logger.debug('Retrieved inventory by SKU', {
      amazonAccountId,
      requestedSkus: sellerSkus.length,
      foundSkus: filtered.length,
    })

    return filtered
  } catch (error) {
    logger.error('Failed to retrieve inventory by SKU', {
      amazonAccountId,
      sellerSkus,
      error: (error as Error).message,
    })
    throw new AppError('Failed to retrieve inventory by SKU from Amazon', 500)
  }
}

/**
 * Parse inventory summary to structured format
 * 
 * Extracts key inventory metrics from summary response.
 * Uses centralized transformer for consistency.
 * 
 * @param summary - Inventory summary
 * @returns Parsed inventory data
 */
export function parseInventorySummary(summary: InventorySummary): {
  sku: string
  asin?: string
  fulfillable: number
  inbound: number
  reserved: number
  unfulfillable: number
  total: number
  lastUpdated?: Date
} {
  const { transformInventorySummary } = require('./transformers')
  const transformed = transformInventorySummary(summary)

  return {
    sku: transformed.sku,
    asin: transformed.asin || undefined,
    fulfillable: transformed.fulfillable,
    inbound: transformed.inbound,
    reserved: transformed.reserved,
    unfulfillable: transformed.unfulfillable,
    total: transformed.total,
    lastUpdated: transformed.lastUpdated || undefined,
  }
}

/**
 * Calculate inventory metrics
 * 
 * Calculates additional detailed FBA metrics from inventory summary.
 * 
 * @param summary - Inventory summary
 * @param healthData - Optional inventory health data for enhanced metrics
 * @returns Calculated metrics with detailed FBA analytics
 */
export function calculateInventoryMetrics(
  summary: InventorySummary,
  healthData?: InventoryHealth
): {
  // Basic quantities
  availableQuantity: number
  inboundQuantity: number
  reservedQuantity: number
  unfulfillableQuantity: number
  totalQuantity: number
  
  // Rate metrics
  availabilityRate: number // Percentage of inventory that's available
  inboundRate: number // Percentage of inventory that's inbound
  unfulfillableRate: number // Percentage of inventory that's unfulfillable
  reservedRate: number // Percentage of inventory that's reserved
  
  // Detailed breakdown
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
  
  // Health metrics (if health data provided)
  daysOfSupply?: number
  sellThroughRate?: number
  estimatedExcessQuantity?: number
  recommendedReplenishmentQuantity?: number
  inventoryAge?: number
  
  // Calculated velocity metrics
  velocity?: {
    unitsPerDay?: number // Estimated units sold per day (if daysOfSupply available)
    turnoverRate?: number // Annual inventory turnover rate
    stockoutRisk?: 'low' | 'medium' | 'high' // Based on days of supply
  }
} {
  const fulfillable = summary.fulfillableQuantity || 0
  const inboundWorking = summary.inboundWorkingQuantity || 0
  const inboundShipped = summary.inboundShippedQuantity || 0
  const inboundReceiving = summary.inboundReceivingQuantity || 0
  const inbound = inboundWorking + inboundShipped + inboundReceiving
  
  const reservedPendingOrder = summary.reservedQuantity?.pendingCustomerOrderQuantity || 0
  const reservedTransshipment = summary.reservedQuantity?.pendingTransshipmentQuantity || 0
  const reservedFCProcessing = summary.reservedQuantity?.fcProcessingQuantity || 0
  const reserved = reservedPendingOrder + reservedTransshipment + reservedFCProcessing
  
  const unfulfillableTotal = summary.unfulfillableQuantity?.totalUnfulfillableQuantity || 0
  const unfulfillableCustomerDamaged = summary.unfulfillableQuantity?.customerDamagedQuantity || 0
  const unfulfillableWarehouseDamaged = summary.unfulfillableQuantity?.warehouseDamagedQuantity || 0
  const unfulfillableDistributorDamaged = summary.unfulfillableQuantity?.distributorDamagedQuantity || 0
  const unfulfillableCarrierDamaged = summary.unfulfillableQuantity?.carrierDamagedQuantity || 0
  const unfulfillableDefective = summary.unfulfillableQuantity?.defectiveQuantity || 0
  const unfulfillableExpired = summary.unfulfillableQuantity?.expiredQuantity || 0
  
  const total = summary.totalQuantity || 0
  const researching = summary.researchingQuantity || 0

  // Calculate rates
  const availabilityRate = total > 0 ? (fulfillable / total) * 100 : 0
  const inboundRate = total > 0 ? (inbound / total) * 100 : 0
  const unfulfillableRate = total > 0 ? (unfulfillableTotal / total) * 100 : 0
  const reservedRate = total > 0 ? (reserved / total) * 100 : 0

  // Velocity metrics (if health data available)
  let velocity: {
    unitsPerDay?: number
    turnoverRate?: number
    stockoutRisk?: 'low' | 'medium' | 'high'
  } | undefined

  if (healthData) {
    const daysOfSupply = healthData.daysOfSupply
    const sellThroughRate = healthData.sellThroughRate || 0

    // Calculate units per day if days of supply is available
    let unitsPerDay: number | undefined
    if (daysOfSupply && daysOfSupply > 0 && fulfillable > 0) {
      unitsPerDay = fulfillable / daysOfSupply
    }

    // Calculate annual turnover rate
    let turnoverRate: number | undefined
    if (sellThroughRate > 0) {
      // Annual turnover = (sell-through rate / 100) * 365
      turnoverRate = (sellThroughRate / 100) * 365
    }

    // Determine stockout risk based on days of supply
    let stockoutRisk: 'low' | 'medium' | 'high' = 'medium'
    if (daysOfSupply !== undefined) {
      if (daysOfSupply < 7) {
        stockoutRisk = 'high'
      } else if (daysOfSupply < 30) {
        stockoutRisk = 'medium'
      } else {
        stockoutRisk = 'low'
      }
    }

    velocity = {
      unitsPerDay,
      turnoverRate,
      stockoutRisk,
    }
  }

  return {
    // Basic quantities
    availableQuantity: fulfillable,
    inboundQuantity: inbound,
    reservedQuantity: reserved,
    unfulfillableQuantity: unfulfillableTotal,
    totalQuantity: total,
    
    // Rate metrics
    availabilityRate,
    inboundRate,
    unfulfillableRate,
    reservedRate,
    
    // Detailed breakdown
    inboundBreakdown: {
      working: inboundWorking,
      shipped: inboundShipped,
      receiving: inboundReceiving,
    },
    reservedBreakdown: {
      pendingCustomerOrder: reservedPendingOrder,
      pendingTransshipment: reservedTransshipment,
      fcProcessing: reservedFCProcessing,
    },
    unfulfillableBreakdown: {
      customerDamaged: unfulfillableCustomerDamaged,
      warehouseDamaged: unfulfillableWarehouseDamaged,
      distributorDamaged: unfulfillableDistributorDamaged,
      carrierDamaged: unfulfillableCarrierDamaged,
      defective: unfulfillableDefective,
      expired: unfulfillableExpired,
    },
    
    // Health metrics (from health data if provided)
    daysOfSupply: healthData?.daysOfSupply,
    sellThroughRate: healthData?.sellThroughRate,
    estimatedExcessQuantity: healthData?.estimatedExcessQuantity,
    recommendedReplenishmentQuantity: healthData?.recommendedReplenishmentQuantity,
    inventoryAge: healthData?.age,
    
    // Velocity metrics
    velocity,
  }
}
