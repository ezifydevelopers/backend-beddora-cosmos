import prisma from '../../../config/db'
import { AppError } from '../../../middlewares/error.middleware'
import { logger } from '../../../config/logger'
import {
  KPIFilters,
  UnitsSoldKPI,
  ReturnsCostKPI,
  AdvertisingCostKPI,
  FBAFeesKPI,
  PayoutEstimateKPI,
} from '../../../types/kpis.types'

/**
 * KPIs Service
 * 
 * Handles all business logic for Key Performance Indicator calculations
 * 
 * Business Logic:
 * - Aggregates units sold from OrderItems
 * - Calculates returns cost from Refunds
 * - Aggregates PPC spend from PPCMetric
 * - Calculates FBA fees from Fee table
 * - Estimates payouts after all deductions
 * - Supports filtering by account, marketplace, SKU, date range
 * - Optimized queries with proper indexes for performance
 */

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Verify user has access to account
 */
async function verifyAccountAccess(userId: string, accountId: string): Promise<void> {
  const userAccount = await prisma.userAccount.findFirst({
    where: {
      userId,
      accountId,
      isActive: true,
    },
  })

  if (!userAccount) {
    throw new AppError('Account not found or access denied', 403)
  }
}

/**
 * Verify user has access to Amazon account
 */
async function verifyAmazonAccountAccess(userId: string, amazonAccountId: string): Promise<void> {
  const amazonAccount = await prisma.amazonAccount.findFirst({
    where: {
      id: amazonAccountId,
      userId,
      isActive: true,
    },
  })

  if (!amazonAccount) {
    throw new AppError('Amazon account not found or access denied', 403)
  }
}

/**
 * Build date filter for Prisma queries
 */
function buildDateFilter(startDate?: string, endDate?: string) {
  const filter: { gte?: Date; lte?: Date } = {}

  if (startDate) {
    filter.gte = new Date(startDate)
  }

  if (endDate) {
    const end = new Date(endDate)
    end.setHours(23, 59, 59, 999)
    filter.lte = end
  }

  return Object.keys(filter).length > 0 ? filter : undefined
}

/**
 * Format period key based on granularity
 */
function formatPeriodKey(date: Date, period: 'hour' | 'day' | 'week' | 'month'): string {
  switch (period) {
    case 'hour':
      return date.toISOString().slice(0, 13) + ':00:00'
    case 'week':
      const weekStart = new Date(date)
      weekStart.setDate(date.getDate() - date.getDay() + 1)
      return weekStart.toISOString().split('T')[0]
    case 'month':
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    case 'day':
    default:
      return date.toISOString().split('T')[0]
  }
}

// ============================================
// UNITS SOLD KPI
// ============================================

/**
 * Get units sold KPI
 * Aggregates units sold from OrderItems
 */
export async function getUnitsSoldKPI(
  filters: KPIFilters,
  userId: string
): Promise<UnitsSoldKPI> {
  const { accountId, amazonAccountId, marketplaceId, sku, startDate, endDate, period = 'day' } =
    filters

  // Verify account access
  if (accountId) {
    await verifyAccountAccess(userId, accountId)
  }

  if (amazonAccountId) {
    await verifyAmazonAccountAccess(userId, amazonAccountId)
  }

  const dateFilter = buildDateFilter(startDate, endDate)

  // Build where clause for orders
  const orderWhere: any = {}
  if (accountId) orderWhere.accountId = accountId
  if (marketplaceId) orderWhere.marketplaceId = marketplaceId
  if (dateFilter) orderWhere.orderDate = dateFilter

  // Get order items
  const orderItems = await prisma.orderItem.findMany({
    where: {
      ...(sku ? { sku } : {}),
      order: orderWhere,
    },
    include: {
      product: {
        select: {
          id: true,
          title: true,
        },
      },
      order: {
        select: {
          marketplaceId: true,
          marketplaceRef: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  })

  // Aggregate by dimensions
  const breakdownMap = new Map<string, {
    sku?: string
    productId?: string
    productTitle?: string
    marketplaceId?: string
    marketplaceName?: string
    period: string
    units: number
    orderCount: number
    orderIds: Set<string>
  }>()

  for (const item of orderItems) {
    const periodKey = formatPeriodKey(item.createdAt, period as any)
    const key = `${item.sku || 'unknown'}-${item.order.marketplaceId || 'unknown'}-${periodKey}`

    if (!breakdownMap.has(key)) {
      breakdownMap.set(key, {
        sku: item.sku,
        productId: item.product?.id || undefined,
        productTitle: item.product?.title || undefined,
        marketplaceId: item.order.marketplaceId || undefined,
        marketplaceName: item.order.marketplaceRef?.name || undefined,
        period: periodKey,
        units: 0,
        orderCount: 0,
        orderIds: new Set(),
      })
    }

    const entry = breakdownMap.get(key)!
    entry.units += item.quantity
    entry.orderIds.add(item.orderId)
    entry.orderCount = entry.orderIds.size
  }

  const breakdown = Array.from(breakdownMap.values()).map(({ orderIds, ...rest }) => rest)

  const totalUnits = breakdown.reduce((sum, item) => sum + item.units, 0)

  return {
    totalUnits,
    breakdown: breakdown.sort((a, b) => b.units - a.units),
    period: {
      startDate: startDate || null,
      endDate: endDate || null,
    },
  }
}

// ============================================
// RETURNS COST KPI
// ============================================

/**
 * Get returns cost KPI
 * Aggregates returns by reason code, SKU, and marketplace
 */
export async function getReturnsCostKPI(
  filters: KPIFilters,
  userId: string
): Promise<ReturnsCostKPI> {
  const { accountId, amazonAccountId, marketplaceId, sku, startDate, endDate } = filters

  // Verify account access
  if (accountId) {
    await verifyAccountAccess(userId, accountId)
  }

  if (amazonAccountId) {
    await verifyAmazonAccountAccess(userId, amazonAccountId)
  }

  const dateFilter = buildDateFilter(startDate, endDate)

  // Build where clause for orders
  const orderWhere: any = {}
  if (accountId) orderWhere.accountId = accountId
  if (marketplaceId) orderWhere.marketplaceId = marketplaceId
  if (dateFilter) orderWhere.orderDate = dateFilter

  // Get refunds
  const refunds = await prisma.refund.findMany({
    where: {
      ...(dateFilter ? { createdAt: dateFilter } : {}),
      order: orderWhere,
    },
    include: {
      order: {
        include: {
          items: sku
            ? {
                where: { sku },
                include: {
                  product: {
                    select: {
                      id: true,
                      title: true,
                    },
                  },
                },
              }
            : {
                include: {
                  product: {
                    select: {
                      id: true,
                      title: true,
                    },
                  },
                },
              },
          marketplaceRef: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  })

  // Aggregate by reason code, SKU, and marketplace
  const breakdownMap = new Map<string, {
    reasonCode: string | null
    reason: string | null
    sku?: string
    productId?: string
    productTitle?: string
    marketplaceId?: string
    marketplaceName?: string
    amount: number
    count: number
  }>()

  for (const refund of refunds) {
    // If filtering by SKU, only include refunds for orders with that SKU
    if (sku && !refund.order.items.some((item) => item.sku === sku)) {
      continue
    }

    // For each SKU in the order, create a breakdown entry
    for (const item of refund.order.items) {
      const key = `${refund.reasonCode || 'unknown'}-${item.sku}-${refund.order.marketplaceId || 'unknown'}`

      if (!breakdownMap.has(key)) {
        breakdownMap.set(key, {
          reasonCode: refund.reasonCode || null,
          reason: refund.reason || null,
          sku: item.sku,
          productId: item.product?.id || undefined,
          productTitle: item.product?.title || undefined,
          marketplaceId: refund.order.marketplaceId || undefined,
          marketplaceName: refund.order.marketplaceRef?.name || undefined,
          amount: 0,
          count: 0,
        })
      }

      const entry = breakdownMap.get(key)!
      // Allocate refund proportionally to item value
      const orderTotal = Number(refund.order.totalAmount)
      const itemProportion = orderTotal > 0 ? Number(item.totalPrice) / orderTotal : 1
      entry.amount += Number(refund.amount) * itemProportion
      entry.count += 1
    }
  }

  const breakdown = Array.from(breakdownMap.values())
  const totalReturnsCost = breakdown.reduce((sum, item) => sum + item.amount, 0)
  const totalReturnsCount = breakdown.reduce((sum, item) => sum + item.count, 0)

  return {
    totalReturnsCost: Number(totalReturnsCost.toFixed(2)),
    totalReturnsCount,
    breakdown: breakdown.sort((a, b) => b.amount - a.amount),
    period: {
      startDate: startDate || null,
      endDate: endDate || null,
    },
  }
}

// ============================================
// ADVERTISING COST KPI
// ============================================

/**
 * Get advertising cost (PPC) KPI
 * Aggregates PPC spend by campaign, ad group, and keyword
 */
export async function getAdvertisingCostKPI(
  filters: KPIFilters,
  userId: string
): Promise<AdvertisingCostKPI> {
  const { accountId, amazonAccountId, campaignId, adGroupId, keywordId, startDate, endDate } =
    filters

  // Verify account access
  if (amazonAccountId) {
    await verifyAmazonAccountAccess(userId, amazonAccountId)
  }

  const dateFilter = buildDateFilter(startDate, endDate)

  // Build where clause
  const whereClause: any = {}
  if (amazonAccountId) whereClause.amazonAccountId = amazonAccountId
  if (campaignId) whereClause.campaignId = campaignId
  if (adGroupId) whereClause.adGroupId = adGroupId
  if (keywordId) whereClause.keywordId = keywordId
  if (dateFilter) whereClause.date = dateFilter

  // Get PPC metrics
  const ppcMetrics = await prisma.pPCMetric.findMany({
    where: whereClause,
    orderBy: {
      date: 'desc',
    },
  })

  // Aggregate by campaign, ad group, keyword
  const breakdownMap = new Map<string, {
    campaignId: string
    campaignName?: string
    adGroupId?: string
    adGroupName?: string
    keywordId?: string
    keywordText?: string
    spend: number
    sales: number
    clicks: number
    impressions: number
    acos: number | null
    roas: number | null
    count: number
  }>()

  for (const metric of ppcMetrics) {
    const key = `${metric.campaignId}-${metric.adGroupId || 'none'}-${metric.keywordId || 'none'}`

    if (!breakdownMap.has(key)) {
      breakdownMap.set(key, {
        campaignId: metric.campaignId,
        adGroupId: metric.adGroupId || undefined,
        keywordId: metric.keywordId || undefined,
        spend: 0,
        sales: 0,
        clicks: 0,
        impressions: 0,
        acos: null,
        roas: null,
        count: 0,
      })
    }

    const entry = breakdownMap.get(key)!
    entry.spend += Number(metric.spend)
    entry.sales += Number(metric.sales)
    entry.clicks += metric.clicks
    entry.impressions += 0 // PPCMetric doesn't have impressions, would need to add
    entry.count += 1

    // Calculate weighted average ACOS
    if (metric.acos !== null) {
      const currentAcos = entry.acos || 0
      entry.acos = (currentAcos * (entry.count - 1) + Number(metric.acos)) / entry.count
    }
  }

  // Calculate ROAS (Return on Ad Spend)
  const breakdown = Array.from(breakdownMap.values()).map((entry) => ({
    ...entry,
    roas: entry.spend > 0 ? entry.sales / entry.spend : null,
    acos: entry.acos,
  }))

  const totalSpend = breakdown.reduce((sum, item) => sum + item.spend, 0)
  const totalSales = breakdown.reduce((sum, item) => sum + item.sales, 0)
  const averageACOS =
    breakdown.length > 0
      ? breakdown.reduce((sum, item) => sum + (item.acos || 0), 0) / breakdown.length
      : 0

  return {
    totalSpend: Number(totalSpend.toFixed(2)),
    totalSales: Number(totalSales.toFixed(2)),
    averageACOS: Number(averageACOS.toFixed(2)),
    breakdown: breakdown.sort((a, b) => b.spend - a.spend),
    period: {
      startDate: startDate || null,
      endDate: endDate || null,
    },
  }
}

// ============================================
// FBA FEES KPI
// ============================================

/**
 * Get FBA fees KPI
 * Aggregates FBA fees by period and fee type
 */
export async function getFBAFeesKPI(
  filters: KPIFilters,
  userId: string
): Promise<FBAFeesKPI> {
  const { accountId, amazonAccountId, startDate, endDate, period = 'day' } = filters

  // Verify account access
  if (accountId) {
    await verifyAccountAccess(userId, accountId)
  }

  if (amazonAccountId) {
    await verifyAmazonAccountAccess(userId, amazonAccountId)
  }

  const dateFilter = buildDateFilter(startDate, endDate)

  // Build where clause for orders
  const orderWhere: any = {}
  if (accountId) orderWhere.accountId = accountId
  if (dateFilter) orderWhere.orderDate = dateFilter

  // Get FBA fees (feeType contains 'FBA')
  const fees = await prisma.fee.findMany({
    where: {
      feeType: {
        contains: 'FBA',
        mode: 'insensitive',
      },
      ...(dateFilter ? { timestamp: dateFilter } : {}),
      order: orderWhere,
    },
    include: {
      order: {
        select: {
          id: true,
        },
      },
    },
  })

  // Aggregate by period and fee type
  const breakdownMap = new Map<string, {
    period: string
    feeType: string
    amount: number
    orderCount: number
    orderIds: Set<string>
  }>()

  for (const fee of fees) {
    const periodKey = formatPeriodKey(fee.timestamp, period as any)
    const key = `${periodKey}-${fee.feeType}`

    if (!breakdownMap.has(key)) {
      breakdownMap.set(key, {
        period: periodKey,
        feeType: fee.feeType,
        amount: 0,
        orderCount: 0,
        orderIds: new Set(),
      })
    }

    const entry = breakdownMap.get(key)!
    entry.amount += Number(fee.amount)
    entry.orderIds.add(fee.orderId)
    entry.orderCount = entry.orderIds.size
  }

  const breakdown = Array.from(breakdownMap.values()).map(({ orderIds, ...rest }) => rest)

  const totalFBAFees = breakdown.reduce((sum, item) => sum + item.amount, 0)

  return {
    totalFBAFees: Number(totalFBAFees.toFixed(2)),
    breakdown: breakdown.sort((a, b) => {
      const dateCompare = a.period.localeCompare(b.period)
      return dateCompare !== 0 ? dateCompare : a.feeType.localeCompare(b.feeType)
    }),
    period: {
      startDate: startDate || null,
      endDate: endDate || null,
      granularity: period as 'hour' | 'day' | 'week' | 'month',
    },
  }
}

// ============================================
// PAYOUT ESTIMATE KPI
// ============================================

/**
 * Get payout estimate KPI
 * Estimates payouts after deductions, fees, and refunds
 */
export async function getPayoutEstimateKPI(
  filters: KPIFilters,
  userId: string
): Promise<PayoutEstimateKPI> {
  const { accountId, amazonAccountId, marketplaceId, startDate, endDate } = filters

  // Verify account access
  if (accountId) {
    await verifyAccountAccess(userId, accountId)
  }

  if (amazonAccountId) {
    await verifyAmazonAccountAccess(userId, amazonAccountId)
  }

  const dateFilter = buildDateFilter(startDate, endDate)

  // Build where clause for orders
  const orderWhere: any = {}
  if (accountId) orderWhere.accountId = accountId
  if (marketplaceId) orderWhere.marketplaceId = marketplaceId
  if (dateFilter) orderWhere.orderDate = dateFilter

  // Get gross revenue from orders
  const ordersAggregation = await prisma.order.aggregate({
    where: orderWhere,
    _sum: {
      totalAmount: true,
    },
  })

  const grossRevenue = Number(ordersAggregation._sum.totalAmount || 0)

  // Get all fees
  const feesAggregation = await prisma.fee.aggregate({
    where: {
      order: orderWhere,
    },
    _sum: {
      amount: true,
    },
  })

  const totalFees = Number(feesAggregation._sum.amount || 0)

  // Get FBA fees specifically
  const fbaFeesAggregation = await prisma.fee.aggregate({
    where: {
      order: orderWhere,
      feeType: {
        contains: 'FBA',
        mode: 'insensitive',
      },
    },
    _sum: {
      amount: true,
    },
  })

  const fbaFees = Number(fbaFeesAggregation._sum.amount || 0)

  // Get refunds
  const refundsAggregation = await prisma.refund.aggregate({
    where: {
      order: orderWhere,
    },
    _sum: {
      amount: true,
    },
  })

  const refunds = Number(refundsAggregation._sum.amount || 0)

  // Get returns cost (same as refunds for now)
  const returnsCost = refunds

  // Get advertising costs (PPC)
  const ppcWhere: any = {}
  if (amazonAccountId) ppcWhere.amazonAccountId = amazonAccountId
  if (dateFilter) ppcWhere.date = dateFilter

  const ppcAggregation = await prisma.pPCMetric.aggregate({
    where: ppcWhere,
    _sum: {
      spend: true,
    },
  })

  const advertising = Number(ppcAggregation._sum.spend || 0)

  // Calculate other fees (non-FBA fees)
  const otherFees = totalFees - fbaFees

  // Calculate COGS from historical snapshots (latest at/under report end).
  let cogs = 0
  if (accountId) {
    const items = await prisma.orderItem.findMany({
      where: {
        order: orderWhere,
      },
      select: {
        sku: true,
        quantity: true,
        order: { select: { marketplaceId: true } },
      },
    })

    const qtyByKey = new Map<string, number>()
    const skus = new Set<string>()
    const marketplaceIds = new Set<string>()

    for (const item of items) {
      if (!item.order.marketplaceId) continue
      const key = `${item.sku}::${item.order.marketplaceId}`
      qtyByKey.set(key, (qtyByKey.get(key) || 0) + item.quantity)
      skus.add(item.sku)
      marketplaceIds.add(item.order.marketplaceId)
    }

    const asOf = endDate ? new Date(endDate) : new Date()
    const latest = await prisma.cOGS.findMany({
      where: {
        accountId,
        sku: { in: Array.from(skus) },
        marketplaceId: { in: Array.from(marketplaceIds) },
        createdAt: { lte: asOf },
      },
      orderBy: { createdAt: 'desc' },
      distinct: ['sku', 'marketplaceId'],
      select: { sku: true, marketplaceId: true, quantity: true, totalCost: true },
    })

    const unitCostByKey = new Map<string, number>()
    for (const row of latest) {
      const effectiveUnitCost = row.quantity > 0 ? Number(row.totalCost) / row.quantity : 0
      unitCostByKey.set(`${row.sku}::${row.marketplaceId}`, effectiveUnitCost)
    }

    for (const [key, qty] of qtyByKey.entries()) {
      const unitCost = unitCostByKey.get(key) || 0
      cogs += unitCost * qty
    }
  }

  // Calculate total deductions
  const totalDeductions = totalFees + refunds + advertising + cogs

  // Calculate estimated payout
  const estimatedPayout = grossRevenue - totalDeductions

  return {
    estimatedPayout: Number(estimatedPayout.toFixed(2)),
    grossRevenue: Number(grossRevenue.toFixed(2)),
    totalDeductions: Number(totalDeductions.toFixed(2)),
    breakdown: {
      fees: Number(otherFees.toFixed(2)),
      refunds: Number(refunds.toFixed(2)),
      returns: Number(returnsCost.toFixed(2)),
      advertising: Number(advertising.toFixed(2)),
      cogs: Number(cogs.toFixed(2)),
      fbaFees: Number(fbaFees.toFixed(2)),
      other: 0, // Placeholder for other deductions
    },
    period: {
      startDate: startDate || null,
      endDate: endDate || null,
    },
  }
}

