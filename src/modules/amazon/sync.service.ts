import prisma from '../../config/db'
import { logger } from '../../config/logger'
import { AppError } from '../../middlewares/error.middleware'
import * as accountsService from '../accounts/accounts.service'
import * as transformers from './transformers'
import { SPAPIWrapper } from './sp-api-wrapper.service'
import {
  createReport,
  getReportDocument,
  getReportStatus,
  ReportStatus,
  ReportType,
} from './reports-api.service'

/**
 * Amazon Sync Service
 * 
 * Production-ready service for syncing data from Amazon Selling Partner API
 * Features:
 * - Comprehensive error handling and retries
 * - Sync logging and audit trails
 * - Multi-marketplace support
 * - Data transformation and validation
 * - Upsert operations to prevent duplicates
 */

// ============================================
// TYPES
// ============================================

export type SyncType = 'orders' | 'fees' | 'ppc' | 'inventory' | 'listings' | 'refunds'

export interface SyncResult {
  success: boolean
  recordsSynced: number
  recordsFailed: number
  errors?: string[]
  syncLogId?: string
}

export interface SyncOptions {
  startDate?: string // ISO date string
  endDate?: string // ISO date string
  marketplaceIds?: string[]
  forceFullSync?: boolean
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get initialized SP API client for an account
 */
async function getClientForAccount(amazonAccountId: string): Promise<SPAPIWrapper> {
  const account = await prisma.amazonAccount.findUnique({
    where: { id: amazonAccountId },
  })

  if (!account) {
    throw new AppError('Amazon account not found', 404)
  }

  if (!account.isActive) {
    throw new AppError('Amazon account is inactive', 400)
  }

  return new SPAPIWrapper(amazonAccountId)
}

/**
 * Get region from marketplace code
 */
function getMarketplaceId(marketplaceCode: string): string {
  const marketplaceIds: Record<string, string> = {
    US: 'ATVPDKIKX0DER',
    CA: 'A2EUQ1WTGCTBG2',
    MX: 'A1AM78C64UM0Y8',
    BR: 'A2Q3Y263D00KWC',
    UK: 'A1F83G8C2ARO7P',
    DE: 'A1PA6795UKMFR9',
    FR: 'A13V1IB3VIYZZH',
    IT: 'APJ6JRA9NG5V4',
    ES: 'A1RKKUPIHCS9HS',
    NL: 'A1805IZSGTT6HS',
    SE: 'A2NODRKZP88ZB9',
    PL: 'A1C3SOZRARQ6R3',
    JP: 'A1VC38T7YXB528',
    AU: 'A39IBJ37TRP1C6',
    IN: 'A21TJRUUN4KGV',
    SG: 'A19VAU5U5O7RUS',
    AE: 'A2VIGQ35RCS4UG',
    SA: 'A17E79C6D8DWNP',
    TR: 'A33AVAJ2PDY3EV',
    EG: 'ARBP9OOSHTCHU',
  }

  return marketplaceIds[marketplaceCode.toUpperCase()] || marketplaceIds.US
}

async function getBuyBoxEligibility(
  client: SPAPIWrapper,
  marketplaceId: string,
  sellerSKUs: string[]
): Promise<Record<string, { buyBoxEligible: boolean; isBuyBoxWinner?: boolean }>> {
  if (sellerSKUs.length === 0) return {}

  const response = await client.get('/products/pricing/v0/items', {
    Skus: sellerSKUs.join(','),
    MarketplaceId: marketplaceId,
  })
  const payload = response?.payload || []
  const results: Record<string, { buyBoxEligible: boolean; isBuyBoxWinner?: boolean }> = {}

  for (const item of payload) {
    const sku =
      item?.sellerSku ||
      item?.SellerSKU ||
      item?.sku ||
      item?.SKU

    if (!sku) continue

    const offers = item?.product?.offers || item?.offers || []
    const isBuyBoxWinner = offers.some((offer: any) => offer?.isBuyBoxWinner)
    const competitive = item?.product?.competitivePricing?.competitivePrices?.some(
      (price: any) => price?.belongsToRequester
    )

    results[sku] = {
      buyBoxEligible: Boolean(isBuyBoxWinner || competitive),
      isBuyBoxWinner,
    }
  }

  return results
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function parseDelimitedReport(content: string): Array<Record<string, string>> {
  const lines = content.split(/\r?\n/).filter((line) => line.trim() !== '')
  if (lines.length === 0) return []

  const delimiter = lines[0].includes('\t') ? '\t' : ','
  const headers = lines[0].split(delimiter).map((h) => h.trim())

  return lines.slice(1).map((line) => {
    const values = line.split(delimiter)
    const row: Record<string, string> = {}
    headers.forEach((header, index) => {
      row[normalizeHeader(header)] = values[index]?.trim() ?? ''
    })
    return row
  })
}

function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function getFirstValue(row: Record<string, string>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = row[key]
    if (value && value.trim() !== '') return value
  }
  return undefined
}

function parseAmount(value?: string): number {
  if (!value) return 0
  const normalized = value.replace(/[^0-9.-]/g, '')
  const parsed = parseFloat(normalized)
  return Number.isNaN(parsed) ? 0 : parsed
}

async function getReturnsFromReport(
  amazonAccountId: string,
  marketplaceId: string,
  createdAfter?: string,
  createdBefore?: string
): Promise<
  Array<{
    returnId?: string
    orderId?: string
    refundAmount?: { amount?: string }
    returnReasonCode?: string
    returnDate?: string
  }>
> {
  const reportId = await createReport(amazonAccountId, {
    reportType: ReportType.GET_FBA_FULFILLMENT_CUSTOMER_RETURNS_DATA,
    marketplaceIds: [marketplaceId],
    dataStartTime: createdAfter,
    dataEndTime: createdBefore,
  })

  const maxAttempts = 20
  let reportDocumentId: string | undefined

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const status = await getReportStatus(amazonAccountId, reportId)

    if (status.processingStatus === ReportStatus.DONE && status.reportDocumentId) {
      reportDocumentId = status.reportDocumentId
      break
    }

    if (status.processingStatus === ReportStatus.CANCELLED || status.processingStatus === ReportStatus.FATAL) {
      throw new AppError(`Returns report failed with status ${status.processingStatus}`, 500)
    }

    await sleep(5000)
  }

  if (!reportDocumentId) {
    throw new AppError('Returns report did not complete in time', 504)
  }

  const reportContent = await getReportDocument(amazonAccountId, reportDocumentId)
  const rows = parseDelimitedReport(reportContent)

  return rows.map((row) => {
    const returnId = getFirstValue(row, [
      'returnid',
      'returnrequestid',
      'rmaid',
      'returnitemid',
    ])
    const orderId = getFirstValue(row, ['orderid', 'amazonorderid'])
    const returnReasonCode = getFirstValue(row, ['returnreasoncode', 'returnreason'])
    const returnDate = getFirstValue(row, [
      'returndate',
      'returnrequestdate',
      'returnrequestdatetime',
    ])
    const refundAmountValue = parseAmount(
      getFirstValue(row, ['refundamount', 'refundtotal', 'amount'])
    )

    return {
      returnId,
      orderId,
      refundAmount: { amount: refundAmountValue.toString() },
      returnReasonCode,
      returnDate,
    }
  })
}

async function getListingsFromReport(
  amazonAccountId: string,
  marketplaceId: string
): Promise<
  Array<{
    sellerSku?: string
    asin?: string
    price?: { amount?: number }
    attributes?: { item_name?: string[] }
  }>
> {
  const reportId = await createReport(amazonAccountId, {
    reportType: ReportType.GET_MERCHANT_LISTINGS_ALL_DATA,
    marketplaceIds: [marketplaceId],
  })

  const maxAttempts = 20
  let reportDocumentId: string | undefined

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const status = await getReportStatus(amazonAccountId, reportId)

    if (status.processingStatus === ReportStatus.DONE && status.reportDocumentId) {
      reportDocumentId = status.reportDocumentId
      break
    }

    if (status.processingStatus === ReportStatus.CANCELLED || status.processingStatus === ReportStatus.FATAL) {
      throw new AppError(`Listings report failed with status ${status.processingStatus}`, 500)
    }

    await sleep(5000)
  }

  if (!reportDocumentId) {
    throw new AppError('Listings report did not complete in time', 504)
  }

  const reportContent = await getReportDocument(amazonAccountId, reportDocumentId)
  const rows = parseDelimitedReport(reportContent)

  return rows.map((row) => {
    const sellerSku = getFirstValue(row, ['sku', 'sellersku', 'merchantsku'])
    const asin = getFirstValue(row, ['asin1', 'asin', 'asin2', 'asin3'])
    const priceValue = parseAmount(getFirstValue(row, ['price', 'standardprice', 'itemprice']))
    const itemName = getFirstValue(row, ['itemname', 'productname', 'title'])

    return {
      sellerSku,
      asin,
      price: { amount: priceValue },
      attributes: itemName ? { item_name: [itemName] } : undefined,
    }
  })
}

/**
 * Create sync log entry
 */
async function createSyncLog(
  userId: string,
  amazonAccountId: string,
  syncType: SyncType,
  status: 'success' | 'failed' | 'partial',
  recordsSynced: number,
  recordsFailed: number,
  errorMessage?: string,
  metadata?: Record<string, any>
): Promise<string> {
  try {
    const syncLog = await prisma.syncLog.create({
      data: {
        userId,
        amazonAccountId,
        syncType,
        status,
        recordsSynced,
        recordsFailed,
        errorMessage: errorMessage?.substring(0, 1000), // Limit error message length
        metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : null,
        completedAt: new Date(),
      },
    })

    return syncLog.id
  } catch (error) {
    logger.error('Failed to create sync log', { error, userId, amazonAccountId, syncType })
    return ''
  }
}

/**
 * Create audit log entry
 */
async function createAuditLog(
  userId: string,
  action: string,
  entity: string,
  entityId: string,
  changes?: Record<string, any>
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        entity,
        entityId,
        changes: changes ? JSON.parse(JSON.stringify(changes)) : null,
      },
    })
  } catch (error) {
    logger.error('Failed to create audit log', { error, userId, action, entity, entityId })
  }
}

// ============================================
// SYNC ORDERS
// ============================================

/**
 * Sync orders from Amazon
 * 
 * Imports orders with fees breakdown
 */
export async function syncOrders(
  userId: string,
  amazonAccountId: string,
  options?: SyncOptions
): Promise<SyncResult> {
  const startTime = Date.now()
  let recordsSynced = 0
  let recordsFailed = 0
  const errors: string[] = []

  try {
    // Verify user owns the account
    const account = await prisma.amazonAccount.findUnique({
      where: { id: amazonAccountId },
    })

    if (!account || account.userId !== userId) {
      throw new AppError('Access denied', 403)
    }

    const client = await getClientForAccount(amazonAccountId)
    const marketplaceId = getMarketplaceId(account.marketplace)

    // Determine date range
    const createdAfter = options?.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const createdBefore = options?.endDate

    // Fetch orders
    const ordersParams: Record<string, any> = {
      MarketplaceIds: marketplaceId,
    }
    if (createdAfter) {
      ordersParams.CreatedAfter = createdAfter
    }
    if (createdBefore) {
      ordersParams.CreatedBefore = createdBefore
    }
    const ordersData = await client.get('/orders/v0/orders', ordersParams)

    if (!ordersData.Orders || ordersData.Orders.length === 0) {
      const syncLogId = await createSyncLog(
        userId,
        amazonAccountId,
        'orders',
        'success',
        0,
        0,
        undefined,
        { message: 'No orders found' }
      )

      return {
        success: true,
        recordsSynced: 0,
        recordsFailed: 0,
        syncLogId,
      }
    }

    // Process each order
    for (const order of ordersData.Orders) {
      try {
        // Get order items and fees
        let fees: any = {}
        let orderItems: any[] = []

        try {
          const itemsData = await client.get(`/orders/v0/orders/${order.AmazonOrderId}/orderItems`)
          orderItems = itemsData.OrderItems || []

          // Extract fees from order items
          fees = {
            referral: 0,
            fba: 0,
            shipping: 0,
            other: 0,
            total: order.OrderTotal?.Amount || 0,
          }

          // Calculate fees from order items
          for (const item of orderItems) {
            if (item.ItemPrice) {
              fees.referral += parseFloat(item.ItemPrice.Amount || '0')
            }
            if (item.ShippingPrice) {
              fees.shipping += parseFloat(item.ShippingPrice.Amount || '0')
            }
          }
        } catch (error: any) {
          logger.warn('Failed to fetch order items', { orderId: order.AmazonOrderId, error: error.message })
        }

        // Upsert order
        const amazonOrder = await prisma.amazonOrder.upsert({
          where: { orderId: order.AmazonOrderId },
          update: {
            status: order.OrderStatus,
            totalAmount: parseFloat(order.OrderTotal?.Amount || '0'),
            fees: fees,
            updatedAt: new Date(),
          },
          create: {
            orderId: order.AmazonOrderId,
            marketplaceId: marketplaceId,
            amazonAccountId: amazonAccountId,
            status: order.OrderStatus,
            totalAmount: parseFloat(order.OrderTotal?.Amount || '0'),
            fees: fees,
          },
        })

        // Store order items using transformer
        if (orderItems.length > 0) {
          const transformedItems = transformers.transformOrderItems(orderItems, order.AmazonOrderId || '')
          
          for (const transformedItem of transformedItems) {
            try {
              // Upsert order item
              await prisma.amazonOrderItem.upsert({
                where: {
                  amazonOrderId_orderItemId: {
                    amazonOrderId: amazonOrder.id,
                    orderItemId: transformedItem.orderItemId,
                  },
                },
                update: {
                  asin: transformedItem.asin,
                  sellerSku: transformedItem.sellerSku,
                  title: transformedItem.title,
                  quantityOrdered: transformedItem.quantityOrdered,
                  quantityShipped: transformedItem.quantityShipped,
                  itemPrice: transformedItem.itemPrice,
                  itemTax: transformedItem.itemTax,
                  shippingPrice: transformedItem.shippingPrice,
                  shippingTax: transformedItem.shippingTax,
                  giftWrapPrice: transformedItem.giftWrapPrice,
                  giftWrapTax: transformedItem.giftWrapTax,
                  itemPromotionDiscount: transformedItem.itemPromotionDiscount,
                  shippingPromotionDiscount: transformedItem.shippingPromotionDiscount,
                  codFee: transformedItem.codFee,
                  codFeeDiscount: transformedItem.codFeeDiscount,
                  currency: transformedItem.currency,
                  productInfo: transformedItem.productInfo,
                  updatedAt: new Date(),
                },
                create: {
                  amazonOrderId: amazonOrder.id,
                  orderItemId: transformedItem.orderItemId,
                  asin: transformedItem.asin,
                  sellerSku: transformedItem.sellerSku,
                  title: transformedItem.title,
                  quantityOrdered: transformedItem.quantityOrdered,
                  quantityShipped: transformedItem.quantityShipped,
                  itemPrice: transformedItem.itemPrice,
                  itemTax: transformedItem.itemTax,
                  shippingPrice: transformedItem.shippingPrice,
                  shippingTax: transformedItem.shippingTax,
                  giftWrapPrice: transformedItem.giftWrapPrice,
                  giftWrapTax: transformedItem.giftWrapTax,
                  itemPromotionDiscount: transformedItem.itemPromotionDiscount,
                  shippingPromotionDiscount: transformedItem.shippingPromotionDiscount,
                  codFee: transformedItem.codFee,
                  codFeeDiscount: transformedItem.codFeeDiscount,
                  currency: transformedItem.currency,
                  productInfo: transformedItem.productInfo,
                },
              })
            } catch (itemError: any) {
              logger.warn('Failed to store order item', {
                orderId: order.AmazonOrderId,
                item: transformedItem.orderItemId,
                error: itemError.message,
              })
              // Continue with other items even if one fails
            }
          }
        }

        recordsSynced++
      } catch (error: any) {
        recordsFailed++
        errors.push(`Order ${order.AmazonOrderId}: ${error.message}`)
        logger.error('Failed to sync order', { orderId: order.AmazonOrderId, error })
      }
    }

    const status = recordsFailed === 0 ? 'success' : recordsFailed < recordsSynced ? 'partial' : 'failed'
    const syncLogId = await createSyncLog(
      userId,
      amazonAccountId,
      'orders',
      status,
      recordsSynced,
      recordsFailed,
      errors.length > 0 ? errors.join('; ') : undefined,
      {
        duration: Date.now() - startTime,
        marketplaceId,
      }
    )

    // Audit log
    await createAuditLog(userId, 'ORDERS_SYNCED', 'AmazonOrder', amazonAccountId, {
      recordsSynced,
      recordsFailed,
      marketplaceId,
    })

    logger.info('Orders sync completed', {
      userId,
      amazonAccountId,
      recordsSynced,
      recordsFailed,
      duration: Date.now() - startTime,
    })

    return {
      success: status !== 'failed',
      recordsSynced,
      recordsFailed,
      errors: errors.length > 0 ? errors : undefined,
      syncLogId,
    }
  } catch (error: any) {
    logger.error('Orders sync failed', { userId, amazonAccountId, error })

    const syncLogId = await createSyncLog(
      userId,
      amazonAccountId,
      'orders',
      'failed',
      0,
      0,
      error.message
    )

    throw new AppError(`Failed to sync orders: ${error.message}`, 500)
  }
}

// ============================================
// SYNC FEES
// ============================================

/**
 * Sync fees from Amazon Financial Events API
 * 
 * Imports: referral fees, FBA fees, storage fees, removal fees, disposal fees
 */
export async function syncFees(
  userId: string,
  amazonAccountId: string,
  options?: SyncOptions
): Promise<SyncResult> {
  const startTime = Date.now()
  let recordsSynced = 0
  let recordsFailed = 0
  const errors: string[] = []

  try {
    const account = await prisma.amazonAccount.findUnique({
      where: { id: amazonAccountId },
    })

    if (!account || account.userId !== userId) {
      throw new AppError('Access denied', 403)
    }

    const client = await getClientForAccount(amazonAccountId)

    // Determine date range
    const postedAfter = options?.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const postedBefore = options?.endDate

    // Fetch financial events
    const financialParams: Record<string, any> = {
      MaxResultsPerPage: 100,
    }
    if (postedAfter) {
      financialParams.PostedAfter = postedAfter
    }
    if (postedBefore) {
      financialParams.PostedBefore = postedBefore
    }
    const financialEvents = await client.get('/finances/v0/financialEvents', financialParams)

    if (!financialEvents.FinancialEvents) {
      const syncLogId = await createSyncLog(
        userId,
        amazonAccountId,
        'fees',
        'success',
        0,
        0,
        undefined,
        { message: 'No financial events found' }
      )

      return {
        success: true,
        recordsSynced: 0,
        recordsFailed: 0,
        syncLogId,
      }
    }

    // Process financial events and update order fees
    const feeTypes = ['ReferralFee', 'FBAPerUnitFulfillmentFee', 'StorageFee', 'RemovalFee', 'DisposalFee']
    const feeMap = new Map<string, any>()

    // Group fees by order ID
    for (const event of financialEvents.FinancialEvents) {
      if (event.ShipmentEventList) {
        for (const shipment of event.ShipmentEventList) {
          if (shipment.ShipmentItemList) {
            for (const item of shipment.ShipmentItemList) {
              const orderId = shipment.AmazonOrderId
              if (!feeMap.has(orderId)) {
                feeMap.set(orderId, {
                  referral: 0,
                  fba: 0,
                  storage: 0,
                  removal: 0,
                  disposal: 0,
                })
              }

              const fees = feeMap.get(orderId)!

              // Extract different fee types
              if (item.ItemFeeList) {
                for (const fee of item.ItemFeeList) {
                  const feeType = fee.FeeType
                  const amount = parseFloat(fee.FeeAmount?.Amount || '0')

                  if (feeType.includes('Referral')) {
                    fees.referral += amount
                  } else if (feeType.includes('FBA') || feeType.includes('Fulfillment')) {
                    fees.fba += amount
                  } else if (feeType.includes('Storage')) {
                    fees.storage += amount
                  } else if (feeType.includes('Removal')) {
                    fees.removal += amount
                  } else if (feeType.includes('Disposal')) {
                    fees.disposal += amount
                  }
                }
              }
            }
          }
        }
      }
    }

    // Update orders with fee breakdown
    for (const [orderId, fees] of feeMap.entries()) {
      try {
        await prisma.amazonOrder.updateMany({
          where: {
            orderId,
            amazonAccountId,
          },
          data: {
            fees: fees,
            updatedAt: new Date(),
          },
        })

        recordsSynced++
      } catch (error: any) {
        recordsFailed++
        errors.push(`Order ${orderId}: ${error.message}`)
      }
    }

    const status = recordsFailed === 0 ? 'success' : recordsFailed < recordsSynced ? 'partial' : 'failed'
    const syncLogId = await createSyncLog(
      userId,
      amazonAccountId,
      'fees',
      status,
      recordsSynced,
      recordsFailed,
      errors.length > 0 ? errors.join('; ') : undefined,
      {
        duration: Date.now() - startTime,
        feeTypesProcessed: feeTypes,
      }
    )

    await createAuditLog(userId, 'FEES_SYNCED', 'AmazonOrder', amazonAccountId, {
      recordsSynced,
      recordsFailed,
    })

    logger.info('Fees sync completed', {
      userId,
      amazonAccountId,
      recordsSynced,
      recordsFailed,
      duration: Date.now() - startTime,
    })

    return {
      success: status !== 'failed',
      recordsSynced,
      recordsFailed,
      errors: errors.length > 0 ? errors : undefined,
      syncLogId,
    }
  } catch (error: any) {
    logger.error('Fees sync failed', { userId, amazonAccountId, error })

    const syncLogId = await createSyncLog(
      userId,
      amazonAccountId,
      'fees',
      'failed',
      0,
      0,
      error.message
    )

    throw new AppError(`Failed to sync fees: ${error.message}`, 500)
  }
}

// ============================================
// SYNC PPC METRICS
// ============================================

/**
 * Sync PPC metrics from Amazon Advertising API
 * 
 * Imports: campaign, ad group, and keyword-level metrics
 */
export async function syncPPC(
  userId: string,
  amazonAccountId: string,
  options?: SyncOptions
): Promise<SyncResult> {
  const startTime = Date.now()
  let recordsSynced = 0
  let recordsFailed = 0
  const errors: string[] = []

  try {
    const account = await prisma.amazonAccount.findUnique({
      where: { id: amazonAccountId },
    })

    if (!account || account.userId !== userId) {
      throw new AppError('Access denied', 403)
    }

    const client = await getClientForAccount(amazonAccountId)
    const marketplaceId = getMarketplaceId(account.marketplace)

    // Get advertising profiles
    const profiles = await client.get('/advertising/v2/profiles')
    if (!profiles || profiles.length === 0) {
      const syncLogId = await createSyncLog(
        userId,
        amazonAccountId,
        'ppc',
        'success',
        0,
        0,
        undefined,
        { message: 'No advertising profiles found' }
      )

      return {
        success: true,
        recordsSynced: 0,
        recordsFailed: 0,
        syncLogId,
      }
    }

    // Determine date range
    const endDate = options?.endDate || new Date().toISOString().split('T')[0]
    const startDate = options?.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    // Process each profile
    for (const profile of profiles) {
      try {
        // Get campaigns
        const campaigns = await client.get(`/advertising/v2/profiles/${profile.profileId}/campaigns`)
        if (!campaigns || campaigns.length === 0) continue

        // Get metrics at campaign level
        const campaignMetrics = await client.get(`/advertising/v2/profiles/${profile.profileId}/metrics`, {
          startDate,
          endDate,
          metrics: [
          'impressions',
          'clicks',
          'cost',
          'attributedSales14d',
          'attributedUnitsOrdered14d',
          ].join(','),
          segment: 'campaign',
        })

        // Get metrics at ad group level
        const adGroupMetrics = await client.get(`/advertising/v2/profiles/${profile.profileId}/metrics`, {
          startDate,
          endDate,
          metrics: [
          'impressions',
          'clicks',
          'cost',
          'attributedSales14d',
          'attributedUnitsOrdered14d',
          ].join(','),
          segment: 'adGroup',
        })

        // Get metrics at keyword level
        const keywordMetrics = await client.get(`/advertising/v2/profiles/${profile.profileId}/metrics`, {
          startDate,
          endDate,
          metrics: [
          'impressions',
          'clicks',
          'cost',
          'attributedSales14d',
          'attributedUnitsOrdered14d',
          ].join(','),
          segment: 'keyword',
        })

        // Process campaign-level metrics
        if (campaignMetrics) {
          for (const metric of Array.isArray(campaignMetrics) ? campaignMetrics : [campaignMetrics]) {
            try {
              const clicks = metric.clicks || 0
              const spend = parseFloat(metric.cost?.amount || '0')
              const sales = parseFloat(metric.attributedSales14d?.amount || '0')
              const acos = spend > 0 ? (spend / sales) * 100 : null

              // Find existing or create new
              const existing = await prisma.pPCMetric.findFirst({
                where: {
                  campaignId: metric.campaignId || '',
                  amazonAccountId,
                  marketplaceId,
                  date: new Date(metric.date || endDate),
                  adGroupId: null,
                  keywordId: null,
                },
              })

              if (existing) {
                await prisma.pPCMetric.update({
                  where: { id: existing.id },
                  data: {
                    clicks,
                    spend,
                    sales,
                    acos,
                    updatedAt: new Date(),
                  },
                })
              } else {
                await prisma.pPCMetric.create({
                  data: {
                    campaignId: metric.campaignId || '',
                    adGroupId: null,
                    keywordId: null,
                    clicks,
                    spend,
                    sales,
                    acos,
                    amazonAccountId,
                    marketplaceId,
                    date: new Date(metric.date || endDate),
                  },
                })
              }

              recordsSynced++
            } catch (error: any) {
              recordsFailed++
              errors.push(`Campaign ${metric.campaignId}: ${error.message}`)
            }
          }
        }

        // Process ad group-level metrics
        if (adGroupMetrics) {
          for (const metric of Array.isArray(adGroupMetrics) ? adGroupMetrics : [adGroupMetrics]) {
            try {
              const clicks = metric.clicks || 0
              const spend = parseFloat(metric.cost?.amount || '0')
              const sales = parseFloat(metric.attributedSales14d?.amount || '0')
              const acos = spend > 0 ? (spend / sales) * 100 : null

              const existing = await prisma.pPCMetric.findFirst({
                where: {
                  campaignId: metric.campaignId || '',
                  adGroupId: metric.adGroupId || null,
                  amazonAccountId,
                  marketplaceId,
                  date: new Date(metric.date || endDate),
                  keywordId: null,
                },
              })

              if (existing) {
                await prisma.pPCMetric.update({
                  where: { id: existing.id },
                  data: {
                    clicks,
                    spend,
                    sales,
                    acos,
                    updatedAt: new Date(),
                  },
                })
              } else {
                await prisma.pPCMetric.create({
                  data: {
                    campaignId: metric.campaignId || '',
                    adGroupId: metric.adGroupId || null,
                    keywordId: null,
                    clicks,
                    spend,
                    sales,
                    acos,
                    amazonAccountId,
                    marketplaceId,
                    date: new Date(metric.date || endDate),
                  },
                })
              }

              recordsSynced++
            } catch (error: any) {
              recordsFailed++
              errors.push(`Ad Group ${metric.adGroupId}: ${error.message}`)
            }
          }
        }

        // Process keyword-level metrics
        if (keywordMetrics) {
          for (const metric of Array.isArray(keywordMetrics) ? keywordMetrics : [keywordMetrics]) {
            try {
              const clicks = metric.clicks || 0
              const spend = parseFloat(metric.cost?.amount || '0')
              const sales = parseFloat(metric.attributedSales14d?.amount || '0')
              const acos = spend > 0 ? (spend / sales) * 100 : null

              const existing = await prisma.pPCMetric.findFirst({
                where: {
                  campaignId: metric.campaignId || '',
                  adGroupId: metric.adGroupId || null,
                  keywordId: metric.keywordId || null,
                  amazonAccountId,
                  marketplaceId,
                  date: new Date(metric.date || endDate),
                },
              })

              if (existing) {
                await prisma.pPCMetric.update({
                  where: { id: existing.id },
                  data: {
                    clicks,
                    spend,
                    sales,
                    acos,
                    updatedAt: new Date(),
                  },
                })
              } else {
                await prisma.pPCMetric.create({
                  data: {
                    campaignId: metric.campaignId || '',
                    adGroupId: metric.adGroupId || null,
                    keywordId: metric.keywordId || null,
                    clicks,
                    spend,
                    sales,
                    acos,
                    amazonAccountId,
                    marketplaceId,
                    date: new Date(metric.date || endDate),
                  },
                })
              }

              recordsSynced++
            } catch (error: any) {
              recordsFailed++
              errors.push(`Keyword ${metric.keywordId}: ${error.message}`)
            }
          }
        }
      } catch (error: any) {
        recordsFailed++
        errors.push(`Profile ${profile.profileId}: ${error.message}`)
      }
    }

    const status = recordsFailed === 0 ? 'success' : recordsFailed < recordsSynced ? 'partial' : 'failed'
    const syncLogId = await createSyncLog(
      userId,
      amazonAccountId,
      'ppc',
      status,
      recordsSynced,
      recordsFailed,
      errors.length > 0 ? errors.join('; ') : undefined,
      {
        duration: Date.now() - startTime,
        marketplaceId,
      }
    )

    await createAuditLog(userId, 'PPC_SYNCED', 'PPCMetric', amazonAccountId, {
      recordsSynced,
      recordsFailed,
    })

    logger.info('PPC sync completed', {
      userId,
      amazonAccountId,
      recordsSynced,
      recordsFailed,
      duration: Date.now() - startTime,
    })

    return {
      success: status !== 'failed',
      recordsSynced,
      recordsFailed,
      errors: errors.length > 0 ? errors : undefined,
      syncLogId,
    }
  } catch (error: any) {
    logger.error('PPC sync failed', { userId, amazonAccountId, error })

    const syncLogId = await createSyncLog(
      userId,
      amazonAccountId,
      'ppc',
      'failed',
      0,
      0,
      error.message
    )

    throw new AppError(`Failed to sync PPC: ${error.message}`, 500)
  }
}

// ============================================
// SYNC INVENTORY
// ============================================

/**
 * Sync inventory levels from Amazon
 */
export async function syncInventory(
  userId: string,
  amazonAccountId: string,
  options?: SyncOptions
): Promise<SyncResult> {
  const startTime = Date.now()
  let recordsSynced = 0
  let recordsFailed = 0
  const errors: string[] = []

  try {
    const account = await prisma.amazonAccount.findUnique({
      where: { id: amazonAccountId },
    })

    if (!account || account.userId !== userId) {
      throw new AppError('Access denied', 403)
    }

    const client = await getClientForAccount(amazonAccountId)
    const marketplaceId = getMarketplaceId(account.marketplace)

    // Fetch inventory summaries
    const inventoryData = await client.get('/fba/inventory/v1/summaries', {
      marketplaceIds: marketplaceId,
      details: 'true',
      granularityType: 'Marketplace',
      granularityId: marketplaceId,
    })

    if (!inventoryData.payload?.inventorySummaries || inventoryData.payload.inventorySummaries.length === 0) {
      const syncLogId = await createSyncLog(
        userId,
        amazonAccountId,
        'inventory',
        'success',
        0,
        0,
        undefined,
        { message: 'No inventory found' }
      )

      return {
        success: true,
        recordsSynced: 0,
        recordsFailed: 0,
        syncLogId,
      }
    }

    // Process each inventory item
    for (const item of inventoryData.payload.inventorySummaries) {
      try {
        await prisma.amazonInventory.upsert({
          where: {
            amazonAccountId_sku_marketplaceId: {
              amazonAccountId,
              sku: item.sellerSku,
              marketplaceId,
            },
          },
          update: {
            stockLevel: item.fulfillableQuantity || 0,
            inboundQty: item.inboundWorkingQuantity || 0,
            updatedAt: new Date(),
          },
          create: {
            sku: item.sellerSku,
            marketplaceId,
            amazonAccountId,
            stockLevel: item.fulfillableQuantity || 0,
            inboundQty: item.inboundWorkingQuantity || 0,
          },
        })

        recordsSynced++
      } catch (error: any) {
        recordsFailed++
        errors.push(`SKU ${item.sellerSku}: ${error.message}`)
        logger.error('Failed to sync inventory item', { sku: item.sellerSku, error })
      }
    }

    const status = recordsFailed === 0 ? 'success' : recordsFailed < recordsSynced ? 'partial' : 'failed'
    const syncLogId = await createSyncLog(
      userId,
      amazonAccountId,
      'inventory',
      status,
      recordsSynced,
      recordsFailed,
      errors.length > 0 ? errors.join('; ') : undefined,
      {
        duration: Date.now() - startTime,
        marketplaceId,
      }
    )

    await createAuditLog(userId, 'INVENTORY_SYNCED', 'AmazonInventory', amazonAccountId, {
      recordsSynced,
      recordsFailed,
    })

    logger.info('Inventory sync completed', {
      userId,
      amazonAccountId,
      recordsSynced,
      recordsFailed,
      duration: Date.now() - startTime,
    })

    return {
      success: status !== 'failed',
      recordsSynced,
      recordsFailed,
      errors: errors.length > 0 ? errors : undefined,
      syncLogId,
    }
  } catch (error: any) {
    logger.error('Inventory sync failed', { userId, amazonAccountId, error })

    const syncLogId = await createSyncLog(
      userId,
      amazonAccountId,
      'inventory',
      'failed',
      0,
      0,
      error.message
    )

    throw new AppError(`Failed to sync inventory: ${error.message}`, 500)
  }
}

// ============================================
// SYNC LISTINGS
// ============================================

/**
 * Sync listing changes and Buy Box status
 */
export async function syncListings(
  userId: string,
  amazonAccountId: string,
  options?: SyncOptions
): Promise<SyncResult> {
  const startTime = Date.now()
  let recordsSynced = 0
  let recordsFailed = 0
  const errors: string[] = []

  try {
    const account = await prisma.amazonAccount.findUnique({
      where: { id: amazonAccountId },
    })

    if (!account || account.userId !== userId) {
      throw new AppError('Access denied', 403)
    }

    const client = await getClientForAccount(amazonAccountId)
    const marketplaceId = getMarketplaceId(account.marketplace)

    // Fetch listings
    const listingsData = {
      items: await getListingsFromReport(amazonAccountId, marketplaceId),
    }

    if (!listingsData.items || listingsData.items.length === 0) {
      const syncLogId = await createSyncLog(
        userId,
        amazonAccountId,
        'listings',
        'success',
        0,
        0,
        undefined,
        { message: 'No listings found' }
      )

      return {
        success: true,
        recordsSynced: 0,
        recordsFailed: 0,
        syncLogId,
      }
    }

    // Get Buy Box eligibility
    const skus = listingsData.items.map((item: any) => item.sellerSku).filter(Boolean)
    let buyBoxData: any = {}

    if (skus.length > 0) {
      try {
        buyBoxData = await getBuyBoxEligibility(client, marketplaceId, skus.slice(0, 20)) // Limit to 20 SKUs per request
      } catch (error: any) {
        logger.warn('Failed to fetch Buy Box eligibility', { error: error.message })
      }
    }

    // Process each listing
    for (const item of listingsData.items) {
      try {
        const changes: any = {
          sku: item.sellerSku,
          asin: item.asin,
          price: item.price?.amount,
          title: item.attributes?.item_name?.[0],
          buyBoxEligible: buyBoxData[item.sellerSku]?.buyBoxEligible || false,
          lastUpdated: new Date().toISOString(),
        }

        await prisma.listingChange.create({
          data: {
            sku: item.sellerSku,
            marketplaceId,
            amazonAccountId,
            changes: changes,
            detectedAt: new Date(),
          },
        })

        recordsSynced++
      } catch (error: any) {
        recordsFailed++
        errors.push(`SKU ${item.sellerSku}: ${error.message}`)
        logger.error('Failed to sync listing', { sku: item.sellerSku, error })
      }
    }

    const status = recordsFailed === 0 ? 'success' : recordsFailed < recordsSynced ? 'partial' : 'failed'
    const syncLogId = await createSyncLog(
      userId,
      amazonAccountId,
      'listings',
      status,
      recordsSynced,
      recordsFailed,
      errors.length > 0 ? errors.join('; ') : undefined,
      {
        duration: Date.now() - startTime,
        marketplaceId,
      }
    )

    await createAuditLog(userId, 'LISTINGS_SYNCED', 'ListingChange', amazonAccountId, {
      recordsSynced,
      recordsFailed,
    })

    logger.info('Listings sync completed', {
      userId,
      amazonAccountId,
      recordsSynced,
      recordsFailed,
      duration: Date.now() - startTime,
    })

    return {
      success: status !== 'failed',
      recordsSynced,
      recordsFailed,
      errors: errors.length > 0 ? errors : undefined,
      syncLogId,
    }
  } catch (error: any) {
    logger.error('Listings sync failed', { userId, amazonAccountId, error })

    const syncLogId = await createSyncLog(
      userId,
      amazonAccountId,
      'listings',
      'failed',
      0,
      0,
      error.message
    )

    throw new AppError(`Failed to sync listings: ${error.message}`, 500)
  }
}

// ============================================
// SYNC REFUNDS
// ============================================

/**
 * Sync refunds and returns from Amazon
 */
export async function syncRefunds(
  userId: string,
  amazonAccountId: string,
  options?: SyncOptions
): Promise<SyncResult> {
  const startTime = Date.now()
  let recordsSynced = 0
  let recordsFailed = 0
  const errors: string[] = []

  try {
    const account = await prisma.amazonAccount.findUnique({
      where: { id: amazonAccountId },
    })

    if (!account || account.userId !== userId) {
      throw new AppError('Access denied', 403)
    }

    const client = await getClientForAccount(amazonAccountId)
    const marketplaceId = getMarketplaceId(account.marketplace)

    // Determine date range
    const createdAfter = options?.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const createdBefore = options?.endDate

    // Fetch returns/refunds
    const returnsData = {
      returns: await getReturnsFromReport(amazonAccountId, marketplaceId, createdAfter, createdBefore),
    }

    if (!returnsData.returns || returnsData.returns.length === 0) {
      const syncLogId = await createSyncLog(
        userId,
        amazonAccountId,
        'refunds',
        'success',
        0,
        0,
        undefined,
        { message: 'No refunds found' }
      )

      return {
        success: true,
        recordsSynced: 0,
        recordsFailed: 0,
        syncLogId,
      }
    }

    // Process each return/refund
    for (const returnItem of returnsData.returns) {
      try {
        await prisma.amazonRefund.upsert({
          where: { refundId: returnItem.returnId },
          update: {
            amount: parseFloat(returnItem.refundAmount?.amount || '0'),
            reasonCode: returnItem.returnReasonCode,
            processedAt: returnItem.returnDate ? new Date(returnItem.returnDate) : null,
            updatedAt: new Date(),
          },
          create: {
            orderId: returnItem.orderId,
            refundId: returnItem.returnId,
            amount: parseFloat(returnItem.refundAmount?.amount || '0'),
            reasonCode: returnItem.returnReasonCode,
            accountId: amazonAccountId,
            marketplaceId,
            processedAt: returnItem.returnDate ? new Date(returnItem.returnDate) : null,
          },
        })

        recordsSynced++
      } catch (error: any) {
        recordsFailed++
        errors.push(`Refund ${returnItem.returnId}: ${error.message}`)
        logger.error('Failed to sync refund', { refundId: returnItem.returnId, error })
      }
    }

    const status = recordsFailed === 0 ? 'success' : recordsFailed < recordsSynced ? 'partial' : 'failed'
    const syncLogId = await createSyncLog(
      userId,
      amazonAccountId,
      'refunds',
      status,
      recordsSynced,
      recordsFailed,
      errors.length > 0 ? errors.join('; ') : undefined,
      {
        duration: Date.now() - startTime,
        marketplaceId,
      }
    )

    await createAuditLog(userId, 'REFUNDS_SYNCED', 'AmazonRefund', amazonAccountId, {
      recordsSynced,
      recordsFailed,
    })

    logger.info('Refunds sync completed', {
      userId,
      amazonAccountId,
      recordsSynced,
      recordsFailed,
      duration: Date.now() - startTime,
    })

    return {
      success: status !== 'failed',
      recordsSynced,
      recordsFailed,
      errors: errors.length > 0 ? errors : undefined,
      syncLogId,
    }
  } catch (error: any) {
    logger.error('Refunds sync failed', { userId, amazonAccountId, error })

    const syncLogId = await createSyncLog(
      userId,
      amazonAccountId,
      'refunds',
      'failed',
      0,
      0,
      error.message
    )

    throw new AppError(`Failed to sync refunds: ${error.message}`, 500)
  }
}

// ============================================
// GET SYNC LOGS
// ============================================

/**
 * Get sync logs for a user
 */
export async function getSyncLogs(
  userId: string,
  amazonAccountId?: string,
  syncType?: SyncType,
  limit: number = 50
) {
  const where: any = { userId }

  if (amazonAccountId) {
    where.amazonAccountId = amazonAccountId
  }

  if (syncType) {
    where.syncType = syncType
  }

  const logs = await prisma.syncLog.findMany({
    where,
    orderBy: { startedAt: 'desc' },
    take: limit,
    include: {
      amazonAccount: {
        select: {
          id: true,
          marketplace: true,
          sellerId: true,
        },
      },
    },
  })

  return logs
}
