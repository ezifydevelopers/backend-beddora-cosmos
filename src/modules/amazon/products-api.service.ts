/**
 * Products API Service
 * 
 * Handles Amazon SP-API Products operations:
 * - Catalog Items API - Get product catalog information
 * - Product Pricing API - Get product pricing and offers
 * - Product Eligibility API - Check product eligibility for programs
 * - Search Catalog Items - Search products by keywords
 * 
 * The Products API provides:
 * - Product catalog data (ASIN, title, images, attributes)
 * - Product pricing information
 * - Buy Box eligibility
 * - Product eligibility for FBA, Subscribe & Save, etc.
 * - Product search capabilities
 * 
 * Architecture:
 * - Uses SPAPIWrapper for authentication
 * - Handles pagination automatically
 * - Parses product data into structured format
 * - Can be extracted to separate microservice
 */

import { logger } from '../../config/logger'
import { AppError } from '../../middlewares/error.middleware'
import { SPAPIWrapper } from './sp-api-wrapper.service'

/**
 * Catalog Item
 */
export interface CatalogItem {
  asin: string
  attributes?: {
    product_type?: string[]
    item_name?: string[]
    brand?: string[]
    manufacturer?: string[]
    part_number?: string[]
    model?: string[]
    color?: string[]
    size?: string[]
    bullet_point?: string[]
    product_description?: string[]
    item_dimensions?: {
      height?: { value?: number; unit?: string }
      length?: { value?: number; unit?: string }
      width?: { value?: number; unit?: string }
      weight?: { value?: number; unit?: string }
    }
    images?: {
      images?: Array<{
        variant?: string
        link?: string
        height?: number
        width?: number
      }>
    }
  }
  identifiers?: {
    marketplaceIdentifiers?: Array<{
      marketplaceId?: string
      asin?: string
    }>
  }
  relationships?: any
  salesRanks?: Array<{
    marketplaceId?: string
    ranks?: Array<{
      title?: string
      rank?: number
      link?: string
    }>
  }>
  summaries?: Array<{
    marketplaceId?: string
    brandName?: string
    browseClassification?: {
      displayName?: string
      classificationId?: string
    }
    colorName?: string
    itemName?: string
    manufacturer?: string
    modelNumber?: string
    sizeName?: string
    styleName?: string
    websiteDisplayGroup?: string
    websiteDisplayGroupName?: string
  }>
  variations?: any
  vendorDetails?: any
}

/**
 * Catalog Items Response
 */
export interface CatalogItemsResponse {
  items?: CatalogItem[]
  pagination?: {
    nextToken?: string
  }
  errors?: any[]
}

/**
 * Product Pricing Offer
 */
export interface ProductPricingOffer {
  sellerId?: string
  condition?: string
  subcondition?: string
  fulfillmentChannel?: string
  offerType?: string
  pricing?: {
    listingPrice?: {
      amount?: number
      currencyCode?: string
    }
    shipping?: {
      amount?: number
      currencyCode?: string
    }
    points?: {
      pointsNumber?: number
      pointsMonetaryValue?: {
        amount?: number
        currencyCode?: string
      }
    }
  }
  availableQuantity?: number
  isFulfilledByAmazon?: boolean
  isBuyBoxWinner?: boolean
  isPrime?: boolean
  isPrimeEligible?: boolean
}

/**
 * Product Pricing
 */
export interface ProductPricing {
  asin?: string
  product?: {
    identifiers?: {
      marketplaceIdentifiers?: Array<{
        marketplaceId?: string
        asin?: string
      }>
    }
    competitivePricing?: {
      competitivePrices?: Array<{
        condition?: string
        subcondition?: string
        price?: {
          amount?: number
          currencyCode?: string
        }
        belongsToRequester?: boolean
      }>
      numberOfOfferListings?: Array<{
        condition?: string
        fulfillmentChannel?: string
        numberOfOffers?: number
      }>
    }
    salesRankings?: Array<{
      productCategoryId?: string
      rank?: number
    }>
    offers?: ProductPricingOffer[]
  }
  status?: string
  errors?: any[]
}

/**
 * Product Pricing Response
 */
export interface ProductPricingResponse {
  payload?: ProductPricing[]
  errors?: any[]
}

/**
 * Product Eligibility
 */
export interface ProductEligibility {
  asin: string
  program: string
  isEligible: boolean
  ineligibilityReasonList?: string[]
}

/**
 * Get catalog items by ASINs
 * 
 * @param amazonAccountId - Amazon account ID
 * @param asins - Array of ASINs to retrieve
 * @param marketplaceIds - Marketplace IDs (defaults to account's marketplaces)
 * @param includedData - Data to include (attributes, identifiers, images, summaries, salesRanks, variations, vendorDetails)
 * @param locale - Locale for localized data (e.g., 'en_US')
 * @returns Catalog items
 */
export async function getCatalogItems(
  amazonAccountId: string,
  asins: string[],
  marketplaceIds?: string[],
  includedData: string[] = ['attributes', 'identifiers', 'images', 'summaries', 'salesRanks'],
  locale?: string
): Promise<CatalogItemsResponse> {
  try {
    const client = new SPAPIWrapper(amazonAccountId)
    await client.initialize()

    if (!marketplaceIds || marketplaceIds.length === 0) {
      // Get marketplace IDs from account if not provided
      // Note: For internal use, we'll query directly to avoid userId requirement
      const prisma = (await import('../../config/db')).default
      const account = await prisma.amazonAccount.findUnique({
        where: { id: amazonAccountId },
        select: { marketplaceIds: true },
      })
      marketplaceIds = account?.marketplaceIds && account.marketplaceIds.length > 0 
        ? account.marketplaceIds 
        : ['ATVPDKIKX0DER'] // Default to US
    }

    const params: any = {
      identifiers: asins.join(','),
      identifiersType: 'ASIN',
      marketplaceIds: marketplaceIds.join(','),
      includedData: includedData.join(','),
    }

    if (locale) {
      params.locale = locale
    }

    const response = await client.get<CatalogItemsResponse>(
      '/catalog/2022-04-01/items',
      params
    )

    logger.debug('Retrieved catalog items', {
      amazonAccountId,
      asinCount: asins.length,
      itemCount: response.items?.length || 0,
    })

    return response
  } catch (error) {
    logger.error('Failed to retrieve catalog items', {
      amazonAccountId,
      asins,
      error: (error as Error).message,
    })
    throw new AppError('Failed to retrieve catalog items from Amazon', 500)
  }
}

/**
 * Search catalog items
 * 
 * @param amazonAccountId - Amazon account ID
 * @param keywords - Search keywords
 * @param marketplaceIds - Marketplace IDs
 * @param pageSize - Results per page (1-20, default 10)
 * @param pageToken - Pagination token
 * @param locale - Locale for localized data
 * @returns Catalog items matching search
 */
export async function searchCatalogItems(
  amazonAccountId: string,
  keywords: string,
  marketplaceIds?: string[],
  pageSize: number = 10,
  pageToken?: string,
  locale?: string
): Promise<CatalogItemsResponse> {
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
        : ['ATVPDKIKX0DER']
    }

    const params: any = {
      keywords,
      marketplaceIds: marketplaceIds.join(','),
      pageSize: Math.min(Math.max(pageSize, 1), 20),
      includedData: 'attributes,identifiers,images,summaries',
    }

    if (pageToken) {
      params.pageToken = pageToken
    }

    if (locale) {
      params.locale = locale
    }

    const response = await client.get<CatalogItemsResponse>(
      '/catalog/2022-04-01/items',
      params
    )

    logger.debug('Searched catalog items', {
      amazonAccountId,
      keywords,
      itemCount: response.items?.length || 0,
      hasNextToken: !!response.pagination?.nextToken,
    })

    return response
  } catch (error) {
    logger.error('Failed to search catalog items', {
      amazonAccountId,
      keywords,
      error: (error as Error).message,
    })
    throw new AppError('Failed to search catalog items from Amazon', 500)
  }
}

/**
 * Get product pricing by ASINs
 * 
 * @param amazonAccountId - Amazon account ID
 * @param asins - Array of ASINs
 * @param marketplaceId - Marketplace ID
 * @param itemCondition - Item condition (New, Used, Collectible, Refurbished, Club)
 * @param customerType - Customer type (Consumer, Business)
 * @returns Product pricing information
 */
export async function getProductPricing(
  amazonAccountId: string,
  asins: string[],
  marketplaceId: string,
  itemCondition?: string,
  customerType?: string
): Promise<ProductPricingResponse> {
  try {
    const client = new SPAPIWrapper(amazonAccountId)
    await client.initialize()

    const params: any = {
      Asins: asins.join(','),
      MarketplaceId: marketplaceId,
    }

    if (itemCondition) {
      params.ItemCondition = itemCondition
    }

    if (customerType) {
      params.CustomerType = customerType
    }

    const response = await client.get<ProductPricingResponse>(
      '/products/pricing/v0/items',
      params
    )

    logger.debug('Retrieved product pricing', {
      amazonAccountId,
      asinCount: asins.length,
      productCount: response.payload?.length || 0,
    })

    return response
  } catch (error) {
    logger.error('Failed to retrieve product pricing', {
      amazonAccountId,
      asins,
      error: (error as Error).message,
    })
    throw new AppError('Failed to retrieve product pricing from Amazon', 500)
  }
}

/**
 * Get product pricing by SKUs
 * 
 * @param amazonAccountId - Amazon account ID
 * @param skus - Array of SKUs
 * @param marketplaceId - Marketplace ID
 * @param itemCondition - Item condition
 * @param customerType - Customer type
 * @returns Product pricing information
 */
export async function getProductPricingBySKU(
  amazonAccountId: string,
  skus: string[],
  marketplaceId: string,
  itemCondition?: string,
  customerType?: string
): Promise<ProductPricingResponse> {
  try {
    const client = new SPAPIWrapper(amazonAccountId)
    await client.initialize()

    const params: any = {
      Skus: skus.join(','),
      MarketplaceId: marketplaceId,
    }

    if (itemCondition) {
      params.ItemCondition = itemCondition
    }

    if (customerType) {
      params.CustomerType = customerType
    }

    const response = await client.get<ProductPricingResponse>(
      '/products/pricing/v0/items',
      params
    )

    logger.debug('Retrieved product pricing by SKU', {
      amazonAccountId,
      skuCount: skus.length,
      productCount: response.payload?.length || 0,
    })

    return response
  } catch (error) {
    logger.error('Failed to retrieve product pricing by SKU', {
      amazonAccountId,
      skus,
      error: (error as Error).message,
    })
    throw new AppError('Failed to retrieve product pricing from Amazon', 500)
  }
}

/**
 * Get product eligibility preview
 * 
 * Checks if products are eligible for programs like FBA, Subscribe & Save, etc.
 * 
 * @param amazonAccountId - Amazon account ID
 * @param asins - Array of ASINs to check
 * @param program - Program to check eligibility for (INBOUND, COMMINGLING, etc.)
 * @param marketplaceIds - Marketplace IDs
 * @returns Product eligibility information
 */
export async function getProductEligibility(
  amazonAccountId: string,
  asins: string[],
  program: string,
  marketplaceIds?: string[]
): Promise<ProductEligibility[]> {
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
        : ['ATVPDKIKX0DER']
    }

    const body = {
      asins,
      program,
      marketplaceIds,
    }

    const response = await client.post<{
      asin?: string
      program?: string
      isEligible?: boolean
      ineligibilityReasonList?: string[]
    }[]>(
      '/fba/inbound/v0/eligibility/itemPreview',
      body
    )

    const eligibility: ProductEligibility[] = (response || []).map((item) => ({
      asin: item.asin || '',
      program: item.program || program,
      isEligible: item.isEligible || false,
      ineligibilityReasonList: item.ineligibilityReasonList,
    }))

    logger.debug('Retrieved product eligibility', {
      amazonAccountId,
      asinCount: asins.length,
      program,
      eligibleCount: eligibility.filter((e) => e.isEligible).length,
    })

    return eligibility
  } catch (error) {
    logger.error('Failed to retrieve product eligibility', {
      amazonAccountId,
      asins,
      program,
      error: (error as Error).message,
    })
    throw new AppError('Failed to retrieve product eligibility from Amazon', 500)
  }
}

/**
 * Get all catalog items (handles pagination automatically)
 * 
 * @param amazonAccountId - Amazon account ID
 * @param asins - Array of ASINs to retrieve
 * @param marketplaceIds - Marketplace IDs
 * @param includedData - Data to include
 * @param locale - Locale for localized data
 * @returns All catalog items (paginated results combined)
 */
export async function getAllCatalogItems(
  amazonAccountId: string,
  asins: string[],
  marketplaceIds?: string[],
  includedData: string[] = ['attributes', 'identifiers', 'images', 'summaries', 'salesRanks'],
  locale?: string
): Promise<CatalogItem[]> {
  const allItems: CatalogItem[] = []
  
  // Process ASINs in batches (API may have limits)
  const batchSize = 20
  for (let i = 0; i < asins.length; i += batchSize) {
    const batch = asins.slice(i, i + batchSize)
    let nextToken: string | undefined

    do {
      const response = await getCatalogItems(
        amazonAccountId,
        batch,
        marketplaceIds,
        includedData,
        locale
      )

      if (response.items) {
        allItems.push(...response.items)
      }

      nextToken = response.pagination?.nextToken
    } while (nextToken)
  }

  logger.info('Retrieved all catalog items', {
    amazonAccountId,
    totalAsins: asins.length,
    totalItems: allItems.length,
  })

  return allItems
}

/**
 * Parse product data from catalog item
 * 
 * Extracts structured product information from catalog item response.
 * Uses centralized transformer for consistency.
 * 
 * @param item - Catalog item
 * @returns Parsed product data
 */
export function parseProductData(item: CatalogItem): {
  asin: string
  title?: string
  brand?: string
  manufacturer?: string
  model?: string
  category?: string
  images?: string[]
  dimensions?: {
    height?: number
    length?: number
    width?: number
    weight?: number
  }
  salesRank?: number
} {
  const { transformCatalogItem } = require('./transformers')
  const transformed = transformCatalogItem(item)

  return {
    asin: transformed.asin,
    title: transformed.title || undefined,
    brand: transformed.brand || undefined,
    manufacturer: transformed.manufacturer || undefined,
    model: transformed.model || undefined,
    category: transformed.category || undefined,
    images: transformed.images.length > 0 ? transformed.images : undefined,
    dimensions: transformed.dimensions || undefined,
    salesRank: transformed.salesRank || undefined,
  }
}
