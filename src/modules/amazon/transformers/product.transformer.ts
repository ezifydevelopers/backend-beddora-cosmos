/**
 * Product Transformers
 * 
 * Utilities for transforming Amazon SP-API Product/Catalog responses
 */

import {
  normalizeString,
  normalizeASIN,
  extractNested,
  safeArrayAccess,
} from './common.transformer'

/**
 * Amazon SP-API Catalog Item structure
 */
export interface AmazonCatalogItem {
  asin: string
  attributes?: Record<string, any>
  identifiers?: {
    marketplaceIds?: string[]
    skus?: Array<{ marketplaceId: string; sku: string }>
  }
  images?: Array<{
    images?: Array<{ link?: string; variant?: string }>
  }>
  summaries?: Array<{
    itemName?: string
    brandName?: string
    manufacturer?: string
    modelNumber?: string
    browseClassification?: {
      displayName?: string
      classificationId?: string
    }
  }>
  salesRanks?: Array<{
    ranks?: Array<{
      rank?: number
      classificationId?: string
    }>
  }>
  variations?: any[]
  vendorDetails?: any
  [key: string]: any
}

/**
 * Transformed product data
 */
export interface TransformedProduct {
  asin: string
  title: string | null
  brand: string | null
  manufacturer: string | null
  model: string | null
  category: string | null
  categoryId: string | null
  images: string[]
  dimensions: {
    height: number | null
    length: number | null
    width: number | null
    weight: number | null
  } | null
  salesRank: number | null
  skus: Array<{
    marketplaceId: string
    sku: string
  }>
  marketplaceIds: string[]
}

/**
 * Transform Amazon Catalog Item to internal format
 * 
 * @param item - Amazon Catalog Item
 * @returns Transformed product data
 */
export function transformCatalogItem(item: AmazonCatalogItem): TransformedProduct {
  const attributes = item.attributes || {}
  const summaries = safeArrayAccess(item.summaries) || {}
  const salesRanks = safeArrayAccess(item.salesRanks)
  const topRank = safeArrayAccess(salesRanks?.ranks)

  // Extract images
  const images: string[] = []
  if (item.images && Array.isArray(item.images)) {
    for (const imageGroup of item.images) {
      if (imageGroup.images && Array.isArray(imageGroup.images)) {
        for (const image of imageGroup.images) {
          if (image.link) {
            images.push(image.link)
          }
        }
      }
    }
  }

  // Extract SKUs
  const skus: Array<{ marketplaceId: string; sku: string }> = []
  if (item.identifiers?.skus && Array.isArray(item.identifiers.skus)) {
    for (const sku of item.identifiers.skus) {
      if (sku.marketplaceId && sku.sku) {
        skus.push({
          marketplaceId: sku.marketplaceId,
          sku: sku.sku,
        })
      }
    }
  }

  // Extract dimensions
  const itemDimensions = attributes.item_dimensions
  const dimensions = itemDimensions
    ? {
        height: extractNested<number>(itemDimensions, 'height.value', null),
        length: extractNested<number>(itemDimensions, 'length.value', null),
        width: extractNested<number>(itemDimensions, 'width.value', null),
        weight: extractNested<number>(itemDimensions, 'weight.value', null),
      }
    : null

  return {
    asin: item.asin,
    title:
      normalizeString(extractNested<string>(attributes, 'item_name.0')) ||
      normalizeString(summaries.itemName) ||
      null,
    brand:
      normalizeString(extractNested<string>(attributes, 'brand.0')) ||
      normalizeString(summaries.brandName) ||
      null,
    manufacturer:
      normalizeString(extractNested<string>(attributes, 'manufacturer.0')) ||
      normalizeString(summaries.manufacturer) ||
      null,
    model:
      normalizeString(extractNested<string>(attributes, 'model.0')) ||
      normalizeString(summaries.modelNumber) ||
      null,
    category: normalizeString(summaries.browseClassification?.displayName),
    categoryId: normalizeString(summaries.browseClassification?.classificationId),
    images,
    dimensions,
    salesRank: topRank?.rank || null,
    skus,
    marketplaceIds: item.identifiers?.marketplaceIds || [],
  }
}

/**
 * Transform array of catalog items
 * 
 * @param items - Array of catalog items
 * @returns Array of transformed product data
 */
export function transformCatalogItems(
  items?: AmazonCatalogItem[] | null
): TransformedProduct[] {
  if (!items || !Array.isArray(items)) return []
  return items.map(transformCatalogItem)
}
