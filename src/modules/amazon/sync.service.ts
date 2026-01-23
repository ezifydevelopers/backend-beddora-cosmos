import prisma from '../../config/db'
import { AmazonSPAPIClient, AmazonCredentials } from './sp-api.client'
import { logger } from '../../config/logger'
import { decrypt } from '../../utils/encryption'
import { AppError } from '../../middlewares/error.middleware'
import * as accountsService from '../accounts/accounts.service'
import * as transformers from './transformers'

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
async function getClientForAccount(amazonAccountId: string): Promise<AmazonSPAPIClient> {
  const account = await prisma.amazonAccount.findUnique({
    where: { id: amazonAccountId },
  })

  if (!account) {
    throw new AppError('Amazon account not found', 404)
  }

  if (!account.isActive) {
    throw new AppError('Amazon account is inactive', 400)
  }

  // Get decrypted credentials
  const credentials: AmazonCredentials = {
    clientId: decrypt(account.accessKey),
    clientSecret: decrypt(account.secretKey),
    refreshToken: decrypt(account.refreshToken),
    region: getRegionFromMarketplace(account.marketplace),
    marketplaceId: account.marketplace,
  }

  return new AmazonSPAPIClient(credentials)
}

/**
 * Get region from marketplace code
 */
function getRegionFromMarketplace(marketplace: string): string {
  const regionMap: Record<string, string> = {
    US: 'us',
    CA: 'us',
    MX: 'us',
    BR: 'us',
    UK: 'eu',
    DE: 'eu',
    FR: 'eu',
    IT: 'eu',
    ES: 'eu',
    NL: 'eu',
    SE: 'eu',
    PL: 'eu',
    JP: 'fe',
    AU: 'fe',
    IN: 'fe',
    SG: 'fe',
    AE: 'eu',
    SA: 'eu',
    TR: 'eu',
    EG: 'eu',
  }

  return regionMap[marketplace.toUpperCase()] || 'us'
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
    const marketplaceId = client.getMarketplaceId(account.marketplace)

    // Determine date range
    const createdAfter = options?.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const createdBefore = options?.endDate

    // Fetch orders
    const ordersData = await client.getOrders([marketplaceId], createdAfter, createdBefore)

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
          const itemsData = await client.getOrderItems(order.AmazonOrderId)
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
    const financialEvents = await client.getFinancialEvents(postedAfter, postedBefore)

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
    const marketplaceId = client.getMarketplaceId(account.marketplace)

    // Get advertising profiles
    const profiles = await client.getAdvertisingProfiles()
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
        const campaigns = await client.getPPCCampaigns(profile.profileId)
        if (!campaigns || campaigns.length === 0) continue

        // Get metrics at campaign level
        const campaignMetrics = await client.getPPCMetrics(profile.profileId, startDate, endDate, [
          'impressions',
          'clicks',
          'cost',
          'attributedSales14d',
          'attributedUnitsOrdered14d',
        ], 'campaign')

        // Get metrics at ad group level
        const adGroupMetrics = await client.getPPCMetrics(profile.profileId, startDate, endDate, [
          'impressions',
          'clicks',
          'cost',
          'attributedSales14d',
          'attributedUnitsOrdered14d',
        ], 'adGroup')

        // Get metrics at keyword level
        const keywordMetrics = await client.getPPCMetrics(profile.profileId, startDate, endDate, [
          'impressions',
          'clicks',
          'cost',
          'attributedSales14d',
          'attributedUnitsOrdered14d',
        ], 'keyword')

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
    const marketplaceId = client.getMarketplaceId(account.marketplace)

    // Fetch inventory summaries
    const inventoryData = await client.getInventorySummaries([marketplaceId], true)

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
    const marketplaceId = client.getMarketplaceId(account.marketplace)

    // Fetch listings
    const listingsData = await client.getListings(marketplaceId)

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
        buyBoxData = await client.getBuyBoxEligibility(marketplaceId, skus.slice(0, 20)) // Limit to 20 SKUs per request
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
    const marketplaceId = client.getMarketplaceId(account.marketplace)

    // Determine date range
    const createdAfter = options?.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const createdBefore = options?.endDate

    // Fetch returns/refunds
    const returnsData = await client.getReturns([marketplaceId], createdAfter, createdBefore)

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
