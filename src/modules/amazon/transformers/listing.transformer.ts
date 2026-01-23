/**
 * Listing Transformers
 * 
 * Utilities for transforming Amazon SP-API Listing/Product responses
 */

import {
  parseMoney,
  parseCurrency,
  parseDate,
  normalizeString,
  normalizeASIN,
  normalizeSKU,
} from './common.transformer'

/**
 * Amazon SP-API Listing Change structure
 */
export interface AmazonListingChange {
  sku?: string
  sellerSku?: string
  asin?: string
  ASIN?: string
  marketplaceId?: string
  MarketplaceId?: string
  eventType?: string
  previousPrice?: string | number
  PreviousPrice?: string | number
  newPrice?: string | number
  NewPrice?: string | number
  previousTitle?: string
  PreviousTitle?: string
  newTitle?: string
  NewTitle?: string
  buyBoxLost?: boolean
  BuyBoxLost?: boolean
  buyBoxWon?: boolean
  BuyBoxWon?: boolean
  newSellerDetected?: boolean
  NewSellerDetected?: boolean
  competitorCount?: number
  CompetitorCount?: number
  [key: string]: any
}

/**
 * Transformed listing change data
 */
export interface TransformedListingChange {
  sku: string
  asin: string | null
  marketplaceId: string
  eventType: string | null
  previousPrice: number | null
  newPrice: number | null
  previousTitle: string | null
  newTitle: string | null
  buyBoxLost: boolean
  buyBoxWon: boolean
  newSellerDetected: boolean
  competitorCount: number | null
  detectedAt: Date
}

/**
 * Transform Amazon Listing Change to internal format
 * 
 * @param change - Amazon Listing Change
 * @param defaultMarketplaceId - Default marketplace ID if not in change
 * @returns Transformed listing change data
 */
export function transformListingChange(
  change: AmazonListingChange,
  defaultMarketplaceId: string = 'ATVPDKIKX0DER'
): TransformedListingChange {
  const sku = normalizeSKU(change.sku || change.sellerSku || change.SKU || change.SellerSKU) || ''
  const asin = normalizeASIN(change.asin || change.ASIN)
  const marketplaceId =
    change.marketplaceId || change.MarketplaceId || defaultMarketplaceId

  // Parse prices (handle both string and number)
  const previousPrice =
    typeof change.previousPrice === 'number'
      ? change.previousPrice
      : typeof change.PreviousPrice === 'number'
        ? change.PreviousPrice
        : parseFloat(change.previousPrice || change.PreviousPrice || '0') || null

  const newPrice =
    typeof change.newPrice === 'number'
      ? change.newPrice
      : typeof change.NewPrice === 'number'
        ? change.NewPrice
        : parseFloat(change.newPrice || change.NewPrice || '0') || null

  return {
    sku,
    asin,
    marketplaceId,
    eventType: normalizeString(change.eventType),
    previousPrice: previousPrice === 0 ? null : previousPrice,
    newPrice: newPrice === 0 ? null : newPrice,
    previousTitle: normalizeString(change.previousTitle || change.PreviousTitle),
    newTitle: normalizeString(change.newTitle || change.NewTitle),
    buyBoxLost: Boolean(change.buyBoxLost || change.BuyBoxLost),
    buyBoxWon: Boolean(change.buyBoxWon || change.BuyBoxWon),
    newSellerDetected: Boolean(change.newSellerDetected || change.NewSellerDetected),
    competitorCount:
      change.competitorCount !== undefined
        ? change.competitorCount
        : change.CompetitorCount !== undefined
          ? change.CompetitorCount
          : null,
    detectedAt: new Date(),
  }
}

/**
 * Transform array of listing changes
 * 
 * @param changes - Array of listing changes
 * @param defaultMarketplaceId - Default marketplace ID
 * @returns Array of transformed listing changes
 */
export function transformListingChanges(
  changes?: AmazonListingChange[] | null,
  defaultMarketplaceId: string = 'ATVPDKIKX0DER'
): TransformedListingChange[] {
  if (!changes || !Array.isArray(changes)) return []
  return changes.map((change) => transformListingChange(change, defaultMarketplaceId))
}
