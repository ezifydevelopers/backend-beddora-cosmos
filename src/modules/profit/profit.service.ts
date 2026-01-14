import prisma from '../../config/db'
import { AppError } from '../../middlewares/error.middleware'
import {
  ProfitFilters,
  ProfitSummary,
  ProductProfitBreakdown,
  MarketplaceProfitBreakdown,
  ProfitTrendData,
  ProfitTrendsResponse,
} from '../../types/profit.types'

/**
 * Profit Service
 * 
 * Handles all business logic for profit calculations and aggregations
 * 
 * Business Logic:
 * - Aggregates sales revenue from Orders
 * - Aggregates expenses from Expense table
 * - Calculates fees from Order fees
 * - Deducts refunds from revenue
 * - Calculates COGS from COGS table
 * - Computes gross profit (Revenue - COGS - Fees)
 * - Computes net profit (Gross Profit - Expenses)
 * - Supports filtering by account, marketplace, SKU, date range
 * - Optimized queries with proper indexes for performance
 * 
 * Future microservice: This entire module can be extracted to a profit-service
 */

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Verify user has access to account
 * Security: Ensures user can only access their own accounts
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
 * Security: Ensures user can only access their own Amazon accounts
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
 * Converts string dates to Date objects with proper timezone handling
 */
function buildDateFilter(startDate?: string, endDate?: string) {
  const filter: { gte?: Date; lte?: Date } = {}

  if (startDate) {
    filter.gte = new Date(startDate)
  }

  if (endDate) {
    // Set end date to end of day for inclusive filtering
    const end = new Date(endDate)
    end.setHours(23, 59, 59, 999)
    filter.lte = end
  }

  return Object.keys(filter).length > 0 ? filter : undefined
}

/**
 * Calculate profit metrics from raw data
 * Reusable calculation logic for profit metrics
 */
function calculateProfitMetrics(
  revenue: number,
  expenses: number,
  fees: number,
  refunds: number,
  cogs: number
): {
  grossProfit: number
  netProfit: number
  grossMargin: number
  netMargin: number
} {
  const grossProfit = revenue - cogs - fees - refunds
  const netProfit = grossProfit - expenses
  const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0
  const netMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0

  return {
    grossProfit: Number(grossProfit.toFixed(2)),
    netProfit: Number(netProfit.toFixed(2)),
    grossMargin: Number(grossMargin.toFixed(2)),
    netMargin: Number(netMargin.toFixed(2)),
  }
}

/**
 * Build a map of latest COGS snapshots per (sku, marketplaceId) as of a given date.
 *
 * Performance:
 * - Uses Prisma `distinct` with `orderBy createdAt desc` to pick the latest snapshot per pair.
 */
async function getLatestCogsSnapshots(params: {
  accountId: string
  skus: string[]
  marketplaceIds: string[]
  asOf: Date
}): Promise<Map<string, { effectiveUnitCost: number }>> {
  if (params.skus.length === 0 || params.marketplaceIds.length === 0) {
    return new Map()
  }

  const rows = await prisma.cOGS.findMany({
    where: {
      accountId: params.accountId,
      sku: { in: params.skus },
      marketplaceId: { in: params.marketplaceIds },
      createdAt: { lte: params.asOf },
    },
    orderBy: { createdAt: 'desc' },
    distinct: ['sku', 'marketplaceId'],
    select: {
      sku: true,
      marketplaceId: true,
      quantity: true,
      totalCost: true,
    },
  })

  const map = new Map<string, { effectiveUnitCost: number }>()
  for (const row of rows) {
    const key = `${row.sku}::${row.marketplaceId}`
    const totalCost = Number(row.totalCost)
    const effectiveUnitCost = row.quantity > 0 ? totalCost / row.quantity : 0
    map.set(key, { effectiveUnitCost: Number(effectiveUnitCost.toFixed(6)) })
  }

  return map
}

function keyForSkuMarketplace(sku: string, marketplaceId: string): string {
  return `${sku}::${marketplaceId}`
}

// ============================================
// PROFIT SUMMARY
// ============================================

/**
 * Get profit summary
 * Aggregates all financial metrics for a given period
 * 
 * Flow:
 * 1. Aggregate sales revenue from Orders
 * 2. Aggregate expenses from Expense table
 * 3. Aggregate fees from Order fees
 * 4. Aggregate refunds from Refund table
 * 5. Calculate COGS from COGS table
 * 6. Calculate gross and net profit
 * 
 * Performance: Uses indexed queries for optimal performance
 */
export async function getProfitSummary(
  filters: ProfitFilters,
  userId: string
): Promise<ProfitSummary> {
  const { accountId, amazonAccountId, marketplaceId, sku, startDate, endDate } = filters

  // Verify account access
  if (accountId) {
    await verifyAccountAccess(userId, accountId)
  }

  if (amazonAccountId) {
    await verifyAmazonAccountAccess(userId, amazonAccountId)
  }

  const dateFilter = buildDateFilter(startDate, endDate)

  // Build base where clause for orders (without SKU join).
  const baseOrderWhere: any = {}
  if (accountId) baseOrderWhere.accountId = accountId
  if (marketplaceId) baseOrderWhere.marketplaceId = marketplaceId
  if (dateFilter) baseOrderWhere.orderDate = dateFilter

  // If filtering by SKU, we need to join with OrderItem for Order aggregation.
  const orderWhere: any = { ...baseOrderWhere }
  if (sku) {
    orderWhere.items = {
      some: {
        sku,
      },
    }
  }

  // Aggregate sales revenue from Orders
  const ordersAggregation = await prisma.order.aggregate({
    where: orderWhere,
    _sum: {
      totalAmount: true,
    },
    _count: {
      id: true,
    },
  })

  const salesRevenue = Number(ordersAggregation._sum.totalAmount || 0)

  // Aggregate fees from Order fees
  const feesAggregation = await prisma.fee.aggregate({
    where: {
      order: {
        ...orderWhere,
      },
    },
    _sum: {
      amount: true,
    },
  })

  const totalFees = Number(feesAggregation._sum.amount || 0)

  // Aggregate refunds
  const refundsAggregation = await prisma.refund.aggregate({
    where: {
      order: {
        ...orderWhere,
      },
    },
    _sum: {
      amount: true,
    },
  })

  const totalRefunds = Number(refundsAggregation._sum.amount || 0)

  // Aggregate expenses
  const expenseWhere: any = {}
  if (accountId) expenseWhere.accountId = accountId
  if (marketplaceId) expenseWhere.marketplaceId = marketplaceId
  if (dateFilter) expenseWhere.expenseDate = dateFilter

  const expensesAggregation = await prisma.expense.aggregate({
    where: expenseWhere,
    _sum: {
      amount: true,
    },
  })

  const totalExpenses = Number(expensesAggregation._sum.amount || 0)

  // Calculate COGS
  // COGS is calculated based on quantity sold per SKU per marketplace.
  // We use historical snapshots from the COGS table: the latest (sku, marketplace) entry at/under the report end date.
  let totalCOGS = 0

  if (accountId) {
    const items = await prisma.orderItem.findMany({
      where: {
        ...(sku ? { sku } : {}),
        order: baseOrderWhere,
      },
      select: {
        sku: true,
        quantity: true,
        order: {
          select: {
            marketplaceId: true,
            orderDate: true,
          },
        },
      },
    })

    const salesQty = new Map<string, number>()
    const skus = new Set<string>()
    const marketplaceIds = new Set<string>()

    for (const item of items) {
      if (!item.order.marketplaceId) continue
      const key = keyForSkuMarketplace(item.sku, item.order.marketplaceId)
      salesQty.set(key, (salesQty.get(key) || 0) + item.quantity)
      skus.add(item.sku)
      marketplaceIds.add(item.order.marketplaceId)
    }

    const asOf = endDate ? new Date(endDate) : new Date()
    const latestCogs = await getLatestCogsSnapshots({
      accountId,
      skus: Array.from(skus),
      marketplaceIds: Array.from(marketplaceIds),
      asOf,
    })

    for (const [key, qty] of salesQty.entries()) {
      const snapshot = latestCogs.get(key)
      if (!snapshot) continue
      totalCOGS += snapshot.effectiveUnitCost * qty
    }
  }

  // Calculate profit metrics
  const metrics = calculateProfitMetrics(salesRevenue, totalExpenses, totalFees, totalRefunds, totalCOGS)

  return {
    salesRevenue: Number(salesRevenue.toFixed(2)),
    totalExpenses: Number(totalExpenses.toFixed(2)),
    totalFees: Number(totalFees.toFixed(2)),
    totalRefunds: Number(totalRefunds.toFixed(2)),
    totalCOGS: Number(totalCOGS.toFixed(2)),
    grossProfit: metrics.grossProfit,
    netProfit: metrics.netProfit,
    grossMargin: metrics.grossMargin,
    netMargin: metrics.netMargin,
    orderCount: ordersAggregation._count.id,
    period: {
      startDate: startDate || null,
      endDate: endDate || null,
    },
  }
}

// ============================================
// PRODUCT BREAKDOWN
// ============================================

/**
 * Get profit breakdown by product/SKU
 * Groups profit metrics by SKU for product-level analysis
 * 
 * Performance: Uses GROUP BY at database level for efficiency
 */
export async function getProfitByProduct(
  filters: ProfitFilters,
  userId: string
): Promise<ProductProfitBreakdown[]> {
  const { accountId, amazonAccountId, marketplaceId, startDate, endDate } = filters

  // Verify account access
  if (accountId) {
    await verifyAccountAccess(userId, accountId)
  }

  if (amazonAccountId) {
    await verifyAmazonAccountAccess(userId, amazonAccountId)
  }

  const dateFilter = buildDateFilter(startDate, endDate)

  // Build where clause
  const orderWhere: any = {}
  if (accountId) orderWhere.accountId = accountId
  if (marketplaceId) orderWhere.marketplaceId = marketplaceId
  if (dateFilter) orderWhere.orderDate = dateFilter

  // Get order items grouped by SKU
  const orderItems = await prisma.orderItem.findMany({
    where: {
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
        include: {
          fees: true,
          refunds: true,
        },
      },
    },
  })

  // Group by SKU and calculate metrics
  const skuMap = new Map<string, ProductProfitBreakdown>()
  const skuQtyByMarketplace = new Map<string, Map<string, number>>() // sku -> marketplaceId -> qty

  for (const item of orderItems) {
    const sku = item.sku

    if (!skuMap.has(sku)) {
      skuMap.set(sku, {
        sku,
        productId: item.product?.id || null,
        productTitle: item.product?.title || null,
        salesRevenue: 0,
        totalExpenses: 0,
        totalFees: 0,
        totalRefunds: 0,
        totalCOGS: 0,
        grossProfit: 0,
        netProfit: 0,
        grossMargin: 0,
        netMargin: 0,
        unitsSold: 0,
        orderCount: 0,
      })
    }

    const breakdown = skuMap.get(sku)!

    // Add revenue
    breakdown.salesRevenue += Number(item.totalPrice)
    breakdown.unitsSold += item.quantity

    // Track sold quantity per marketplace for accurate COGS allocation
    const itemMarketplaceId = item.order.marketplaceId
    if (itemMarketplaceId) {
      if (!skuQtyByMarketplace.has(sku)) {
        skuQtyByMarketplace.set(sku, new Map())
      }
      const mpMap = skuQtyByMarketplace.get(sku)!
      mpMap.set(itemMarketplaceId, (mpMap.get(itemMarketplaceId) || 0) + item.quantity)
    }

    // Add fees (proportional to item value)
    const orderTotal = Number(item.order.totalAmount)
    if (orderTotal > 0) {
      const itemProportion = Number(item.totalPrice) / orderTotal
      const orderFees = item.order.fees.reduce((sum, fee) => sum + Number(fee.amount), 0)
      breakdown.totalFees += orderFees * itemProportion
    }

    // Add refunds (proportional to item value)
    const orderRefunds = item.order.refunds.reduce((sum, refund) => sum + Number(refund.amount), 0)
    if (orderTotal > 0) {
      const itemProportion = Number(item.totalPrice) / orderTotal
      breakdown.totalRefunds += orderRefunds * itemProportion
    }

    breakdown.orderCount += 1
  }

  // Build latest COGS snapshots for the SKUs/marketplaces present in sales.
  const latestCogsByKey = accountId
    ? await getLatestCogsSnapshots({
        accountId,
        skus: Array.from(skuQtyByMarketplace.keys()),
        marketplaceIds: Array.from(
          new Set(Array.from(skuQtyByMarketplace.values()).flatMap((m) => Array.from(m.keys())))
        ),
        asOf: endDate ? new Date(endDate) : new Date(),
      })
    : new Map()

  // Calculate expenses per SKU (proportional to revenue)
  const expenseWhere: any = {}
  if (accountId) expenseWhere.accountId = accountId
  if (marketplaceId) expenseWhere.marketplaceId = marketplaceId
  if (dateFilter) expenseWhere.expenseDate = dateFilter

  const expenses = await prisma.expense.findMany({
    where: expenseWhere,
  })

  const totalRevenue = Array.from(skuMap.values()).reduce((sum, b) => sum + b.salesRevenue, 0)

  // Calculate final metrics for each SKU
  const results: ProductProfitBreakdown[] = []

  for (const [sku, breakdown] of skuMap.entries()) {
    // Set COGS based on sold quantities per marketplace and latest COGS snapshots
    const mpQty = skuQtyByMarketplace.get(sku)
    if (mpQty && latestCogsByKey.size > 0) {
      let cogs = 0
      for (const [mpId, qty] of mpQty.entries()) {
        const snapshot = latestCogsByKey.get(keyForSkuMarketplace(sku, mpId))
        if (!snapshot) continue
        cogs += snapshot.effectiveUnitCost * qty
      }
      breakdown.totalCOGS = cogs
    } else {
      breakdown.totalCOGS = 0
    }

    // Allocate expenses proportionally
    if (totalRevenue > 0) {
      const revenueProportion = breakdown.salesRevenue / totalRevenue
      breakdown.totalExpenses = expenses.reduce(
        (sum, exp) => sum + Number(exp.amount) * revenueProportion,
        0
      )
    }

    // Calculate profit metrics
    const metrics = calculateProfitMetrics(
      breakdown.salesRevenue,
      breakdown.totalExpenses,
      breakdown.totalFees,
      breakdown.totalRefunds,
      breakdown.totalCOGS
    )

    breakdown.grossProfit = metrics.grossProfit
    breakdown.netProfit = metrics.netProfit
    breakdown.grossMargin = metrics.grossMargin
    breakdown.netMargin = metrics.netMargin

    // Round values
    breakdown.salesRevenue = Number(breakdown.salesRevenue.toFixed(2))
    breakdown.totalExpenses = Number(breakdown.totalExpenses.toFixed(2))
    breakdown.totalFees = Number(breakdown.totalFees.toFixed(2))
    breakdown.totalRefunds = Number(breakdown.totalRefunds.toFixed(2))
    breakdown.totalCOGS = Number(breakdown.totalCOGS.toFixed(2))

    results.push(breakdown)
  }

  // Sort by revenue descending
  return results.sort((a, b) => b.salesRevenue - a.salesRevenue)
}

// ============================================
// MARKETPLACE BREAKDOWN
// ============================================

/**
 * Get profit breakdown by marketplace
 * Groups profit metrics by Marketplace for marketplace-level analysis
 */
export async function getProfitByMarketplace(
  filters: ProfitFilters,
  userId: string
): Promise<MarketplaceProfitBreakdown[]> {
  const { accountId, amazonAccountId, startDate, endDate } = filters

  // Verify account access
  if (accountId) {
    await verifyAccountAccess(userId, accountId)
  }

  if (amazonAccountId) {
    await verifyAmazonAccountAccess(userId, amazonAccountId)
  }

  const dateFilter = buildDateFilter(startDate, endDate)

  // Build where clause
  const orderWhere: any = {}
  if (accountId) orderWhere.accountId = accountId
  if (dateFilter) orderWhere.orderDate = dateFilter
  orderWhere.marketplaceId = { not: null } // Only orders with marketplace

  // Get orders with marketplace
  const orders = await prisma.order.findMany({
    where: orderWhere,
    include: {
      marketplaceRef: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
      fees: true,
      refunds: true,
      items: true,
    },
  })

  // Group by marketplace
  const marketplaceMap = new Map<string, MarketplaceProfitBreakdown>()

  for (const order of orders) {
    if (!order.marketplaceId || !order.marketplaceRef) continue

    const marketplaceId = order.marketplaceId

    if (!marketplaceMap.has(marketplaceId)) {
      marketplaceMap.set(marketplaceId, {
        marketplaceId,
        marketplaceName: order.marketplaceRef.name,
        marketplaceCode: order.marketplaceRef.code,
        salesRevenue: 0,
        totalExpenses: 0,
        totalFees: 0,
        totalRefunds: 0,
        totalCOGS: 0,
        grossProfit: 0,
        netProfit: 0,
        grossMargin: 0,
        netMargin: 0,
        orderCount: 0,
      })
    }

    const breakdown = marketplaceMap.get(marketplaceId)!

    breakdown.salesRevenue += Number(order.totalAmount)
    breakdown.totalFees += order.fees.reduce((sum, fee) => sum + Number(fee.amount), 0)
    breakdown.totalRefunds += order.refunds.reduce((sum, refund) => sum + Number(refund.amount), 0)
    breakdown.orderCount += 1
  }

  // Get expenses by marketplace
  const expenseWhere: any = {}
  if (accountId) expenseWhere.accountId = accountId
  if (dateFilter) expenseWhere.expenseDate = dateFilter
  expenseWhere.marketplaceId = { not: null }

  const expenses = await prisma.expense.findMany({
    where: expenseWhere,
    include: {
      marketplace: {
        select: {
          id: true,
        },
      },
    },
  })

  // Allocate expenses to marketplaces
  for (const expense of expenses) {
    if (!expense.marketplaceId) continue

    const breakdown = marketplaceMap.get(expense.marketplaceId)
    if (breakdown) {
      breakdown.totalExpenses += Number(expense.amount)
    }
  }

  // Calculate COGS per marketplace (based on order items)
  const orderItems = await prisma.orderItem.findMany({
    where: {
      order: orderWhere,
    },
    include: {
      order: {
        select: {
          marketplaceId: true,
        },
      },
    },
  })

  // Get COGS records
  // Build latest COGS snapshots (historical) per (sku, marketplace) as-of endDate.
  const skuSalesByMarketplace = new Map<string, Map<string, number>>() // marketplaceId -> sku -> quantity

  for (const item of orderItems) {
    if (!item.order.marketplaceId) continue

    const marketplaceId = item.order.marketplaceId
    if (!skuSalesByMarketplace.has(marketplaceId)) {
      skuSalesByMarketplace.set(marketplaceId, new Map())
    }

    const skuMap = skuSalesByMarketplace.get(marketplaceId)!
    const existing = skuMap.get(item.sku) || 0
    skuMap.set(item.sku, existing + item.quantity)
  }

  // Allocate COGS to marketplaces
  const latestCogsByKey =
    accountId && skuSalesByMarketplace.size > 0
      ? await getLatestCogsSnapshots({
          accountId,
          skus: Array.from(
            new Set(Array.from(skuSalesByMarketplace.values()).flatMap((m) => Array.from(m.keys())))
          ),
          marketplaceIds: Array.from(skuSalesByMarketplace.keys()),
          asOf: endDate ? new Date(endDate) : new Date(),
        })
      : new Map()

  for (const [marketplaceId, skuMap] of skuSalesByMarketplace.entries()) {
    const breakdown = marketplaceMap.get(marketplaceId)
    if (!breakdown) continue

    let marketplaceCOGS = 0
    for (const [sku, quantitySold] of skuMap.entries()) {
      const snapshot = latestCogsByKey.get(keyForSkuMarketplace(sku, marketplaceId))
      if (!snapshot) continue
      marketplaceCOGS += snapshot.effectiveUnitCost * quantitySold
    }

    breakdown.totalCOGS = marketplaceCOGS
  }

  // Calculate final metrics
  const results: MarketplaceProfitBreakdown[] = []

  for (const [, breakdown] of marketplaceMap.entries()) {
    const metrics = calculateProfitMetrics(
      breakdown.salesRevenue,
      breakdown.totalExpenses,
      breakdown.totalFees,
      breakdown.totalRefunds,
      breakdown.totalCOGS
    )

    breakdown.grossProfit = metrics.grossProfit
    breakdown.netProfit = metrics.netProfit
    breakdown.grossMargin = metrics.grossMargin
    breakdown.netMargin = metrics.netMargin

    // Round values
    breakdown.salesRevenue = Number(breakdown.salesRevenue.toFixed(2))
    breakdown.totalExpenses = Number(breakdown.totalExpenses.toFixed(2))
    breakdown.totalFees = Number(breakdown.totalFees.toFixed(2))
    breakdown.totalRefunds = Number(breakdown.totalRefunds.toFixed(2))
    breakdown.totalCOGS = Number(breakdown.totalCOGS.toFixed(2))

    results.push(breakdown)
  }

  // Sort by revenue descending
  return results.sort((a, b) => b.salesRevenue - a.salesRevenue)
}

// ============================================
// PROFIT TRENDS
// ============================================

/**
 * Get profit trends over time
 * Returns time-series data for chart visualization
 * 
 * Groups data by day, week, or month based on period parameter
 */
export async function getProfitTrends(
  filters: ProfitFilters,
  userId: string
): Promise<ProfitTrendsResponse> {
  const {
    accountId,
    amazonAccountId,
    marketplaceId,
    sku,
    startDate,
    endDate,
    period: periodRaw = 'day',
  } = filters

  // Normalize unsupported UI values to the supported API grouping set.
  const period: 'day' | 'week' | 'month' = periodRaw === 'custom' ? 'day' : periodRaw

  // Verify account access
  if (accountId) {
    await verifyAccountAccess(userId, accountId)
  }

  if (amazonAccountId) {
    await verifyAmazonAccountAccess(userId, amazonAccountId)
  }

  // Set default date range if not provided (last 30 days)
  const end = endDate ? new Date(endDate) : new Date()
  const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  // Get all orders in date range
  const orderWhere: any = {
    accountId: accountId || undefined,
    marketplaceId: marketplaceId || undefined,
    orderDate: {
      gte: start,
      lte: end,
    },
  }

  if (sku) {
    orderWhere.items = {
      some: {
        sku,
      },
    }
  }

  const orders = await prisma.order.findMany({
    where: orderWhere,
    include: {
      fees: true,
      refunds: true,
      items: sku
        ? {
            where: {
              sku,
            },
          }
        : true,
    },
    orderBy: {
      orderDate: 'asc',
    },
  })

  // Group by period
  const periodMap = new Map<string, ProfitTrendData>()
  const salesQtyByPeriod = new Map<string, Map<string, number>>() // periodKey -> (sku::marketplaceId) -> qty
  const skusInSales = new Set<string>()
  const marketplacesInSales = new Set<string>()

  for (const order of orders) {
    let periodKey: string
    let periodLabel: string

    const orderDate = order.orderDate

    switch (period) {
      case 'week': {
        // Get week start (Monday)
        const weekStart = new Date(orderDate)
        weekStart.setDate(orderDate.getDate() - orderDate.getDay() + 1)
        periodKey = weekStart.toISOString().split('T')[0]
        periodLabel = `Week of ${periodKey}`
        break
      }
      case 'month':
        periodKey = `${orderDate.getFullYear()}-${String(orderDate.getMonth() + 1).padStart(2, '0')}`
        periodLabel = periodKey
        break
      case 'day':
      default:
        periodKey = orderDate.toISOString().split('T')[0]
        periodLabel = periodKey
        break
    }

    if (!periodMap.has(periodKey)) {
      periodMap.set(periodKey, {
        date: periodKey,
        period: periodLabel,
        salesRevenue: 0,
        totalExpenses: 0,
        totalFees: 0,
        totalRefunds: 0,
        totalCOGS: 0,
        grossProfit: 0,
        netProfit: 0,
        grossMargin: 0,
        netMargin: 0,
        orderCount: 0,
      })
    }

    const trendData = periodMap.get(periodKey)!

    trendData.salesRevenue += Number(order.totalAmount)
    trendData.totalFees += order.fees.reduce((sum, fee) => sum + Number(fee.amount), 0)
    trendData.totalRefunds += order.refunds.reduce((sum, refund) => sum + Number(refund.amount), 0)
    trendData.orderCount += 1

    // Track sold quantity for COGS computation (per SKU + marketplace per period)
    if (order.marketplaceId) {
      if (!salesQtyByPeriod.has(periodKey)) {
        salesQtyByPeriod.set(periodKey, new Map())
      }
      const periodSales = salesQtyByPeriod.get(periodKey)!

      for (const item of order.items as any[]) {
        const key = keyForSkuMarketplace(item.sku as string, order.marketplaceId)
        periodSales.set(key, (periodSales.get(key) || 0) + (item.quantity as number))
        skusInSales.add(item.sku as string)
        marketplacesInSales.add(order.marketplaceId)
      }
    }
  }

  // Get expenses by period
  const expenseWhere: any = {
    accountId: accountId || undefined,
    marketplaceId: marketplaceId || undefined,
    expenseDate: {
      gte: start,
      lte: end,
    },
  }

  const expenses = await prisma.expense.findMany({
    where: expenseWhere,
  })

  // Allocate expenses to periods
  for (const expense of expenses) {
    const expenseDate = expense.expenseDate
    let periodKey: string

    switch (period) {
      case 'week': {
        const weekStart = new Date(expenseDate)
        weekStart.setDate(expenseDate.getDate() - expenseDate.getDay() + 1)
        periodKey = weekStart.toISOString().split('T')[0]
        break
      }
      case 'month':
        periodKey = `${expenseDate.getFullYear()}-${String(expenseDate.getMonth() + 1).padStart(2, '0')}`
        break
      case 'day':
      default:
        periodKey = expenseDate.toISOString().split('T')[0]
        break
    }

    const trendData = periodMap.get(periodKey)
    if (trendData) {
      trendData.totalExpenses += Number(expense.amount)
    }
  }

  // Calculate COGS by period using historical COGS snapshots.
  // For each period, we pick the latest COGS snapshot at/under the end of that period.
  if (accountId && salesQtyByPeriod.size > 0 && skusInSales.size > 0 && marketplacesInSales.size > 0) {
    const cogsTimeline = await prisma.cOGS.findMany({
      where: {
        accountId,
        sku: { in: Array.from(skusInSales) },
        marketplaceId: { in: Array.from(marketplacesInSales) },
        createdAt: { lte: end },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        sku: true,
        marketplaceId: true,
        createdAt: true,
        quantity: true,
        totalCost: true,
      },
    })

    const timelineByKey = new Map<string, Array<{ at: Date; effectiveUnitCost: number }>>()
    for (const row of cogsTimeline) {
      const key = keyForSkuMarketplace(row.sku, row.marketplaceId)
      const effectiveUnitCost = row.quantity > 0 ? Number(row.totalCost) / row.quantity : 0
      if (!timelineByKey.has(key)) timelineByKey.set(key, [])
      timelineByKey.get(key)!.push({ at: row.createdAt, effectiveUnitCost })
    }

    const periodEndDate = (pKey: string): Date => {
      if (period === 'month') {
        const [y, m] = pKey.split('-').map((v) => Number(v))
        const lastDay = new Date(y, m, 0) // month is 1-based here because `m` is already 1..12
        lastDay.setHours(23, 59, 59, 999)
        return lastDay
      }
      const startOf = new Date(pKey)
      if (period === 'week') {
        const endOfWeek = new Date(startOf)
        endOfWeek.setDate(startOf.getDate() + 6)
        endOfWeek.setHours(23, 59, 59, 999)
        return endOfWeek
      }
      startOf.setHours(23, 59, 59, 999)
      return startOf
    }

    const latestUnitCostAt = (key: string, asOf: Date): number => {
      const arr = timelineByKey.get(key)
      if (!arr || arr.length === 0) return 0

      // Binary search last entry with at <= asOf
      let lo = 0
      let hi = arr.length - 1
      let best = -1
      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2)
        if (arr[mid].at.getTime() <= asOf.getTime()) {
          best = mid
          lo = mid + 1
        } else {
          hi = mid - 1
        }
      }
      return best >= 0 ? arr[best].effectiveUnitCost : 0
    }

    for (const [pKey, qtyMap] of salesQtyByPeriod.entries()) {
      const trendData = periodMap.get(pKey)
      if (!trendData) continue
      const asOf = periodEndDate(pKey)

      let periodCOGS = 0
      for (const [key, qty] of qtyMap.entries()) {
        const unitCost = latestUnitCostAt(key, asOf)
        periodCOGS += unitCost * qty
      }
      trendData.totalCOGS = periodCOGS
    }
  }

  // Calculate final metrics for each period
  const results: ProfitTrendData[] = []

  for (const [, trendData] of periodMap.entries()) {
    const metrics = calculateProfitMetrics(
      trendData.salesRevenue,
      trendData.totalExpenses,
      trendData.totalFees,
      trendData.totalRefunds,
      trendData.totalCOGS
    )

    trendData.grossProfit = metrics.grossProfit
    trendData.netProfit = metrics.netProfit
    trendData.grossMargin = metrics.grossMargin
    trendData.netMargin = metrics.netMargin

    // Round values
    trendData.salesRevenue = Number(trendData.salesRevenue.toFixed(2))
    trendData.totalExpenses = Number(trendData.totalExpenses.toFixed(2))
    trendData.totalFees = Number(trendData.totalFees.toFixed(2))
    trendData.totalRefunds = Number(trendData.totalRefunds.toFixed(2))
    trendData.totalCOGS = Number(trendData.totalCOGS.toFixed(2))

    results.push(trendData)
  }

  // Sort by date ascending
  results.sort((a, b) => a.date.localeCompare(b.date))

  return {
    data: results,
    period,
    startDate: start.toISOString().split('T')[0],
    endDate: end.toISOString().split('T')[0],
  }
}
