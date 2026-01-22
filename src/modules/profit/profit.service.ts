import prisma from '../../config/db'
import { AppError } from '../../middlewares/error.middleware'
import { logger } from '../../config/logger'
import {
  ProfitFilters,
  ProfitSummary,
  ProductProfitBreakdown,
  MarketplaceProfitBreakdown,
  ProfitTrendData,
  ProfitTrendsResponse,
  OrderItemProfitBreakdown,
  PLResponse,
  PLMetricRow,
  PLPeriodValue,
  CountryProfitBreakdown,
  ProfitTrendsSimpleResponse,
  ProductTrendsResponse,
  ProductTrendDateValue,
} from '../../types/profit.types'

interface AllocatedProductEntry {
  sku: string
  percentage: number
}

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

function parseAllocatedProducts(value: unknown): AllocatedProductEntry[] {
  if (!value || !Array.isArray(value)) return []

  return value
    .map((item: any) => ({
      sku: typeof item?.sku === 'string' ? item.sku : '',
      percentage: typeof item?.percentage === 'number' ? item.percentage : Number(item?.percentage || 0),
    }))
    .filter((item) => item.sku && item.percentage > 0)
}

function getAllocatedExpenseAmount(expense: { amount: any; allocatedProducts?: unknown }, sku: string): number {
  const allocations = parseAllocatedProducts(expense.allocatedProducts)
  if (allocations.length === 0) return 0

  const match = allocations.find((entry) => entry.sku === sku)
  if (!match) return 0

  return Number(expense.amount) * (match.percentage / 100)
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

  // Build base where clause for orders
  const orderWhere: any = {}
  if (accountId) orderWhere.accountId = accountId
  if (marketplaceId) orderWhere.marketplaceId = marketplaceId
  if (dateFilter) orderWhere.orderDate = dateFilter

  // If filtering by SKU, we need to join with OrderItem
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

  let totalFees = Number(feesAggregation._sum.amount || 0)

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

  let totalRefunds = Number(refundsAggregation._sum.amount || 0)

  // Aggregate returns (refunds + fees)
  const returnWhere: any = {}
  if (accountId) returnWhere.accountId = accountId
  if (marketplaceId) returnWhere.marketplaceId = marketplaceId
  if (sku) returnWhere.sku = sku
  if (dateFilter) returnWhere.createdAt = dateFilter

  const returnsAggregation = await prisma.return.aggregate({
    where: returnWhere,
    _sum: {
      refundAmount: true,
      feeAmount: true,
    },
  })

  totalRefunds += Number(returnsAggregation._sum.refundAmount || 0)
  totalFees += Number(returnsAggregation._sum.feeAmount || 0)

  // Aggregate expenses
  const expenseWhere: any = {}
  if (accountId) expenseWhere.accountId = accountId
  if (marketplaceId) expenseWhere.marketplaceId = marketplaceId
  if (dateFilter) expenseWhere.incurredAt = dateFilter

  let totalExpenses = 0
  if (sku) {
    const expenses = await prisma.expense.findMany({
      where: expenseWhere,
      select: {
        amount: true,
        allocatedProducts: true,
      },
    })

    totalExpenses = expenses.reduce(
      (sum, expense) => sum + getAllocatedExpenseAmount(expense, sku),
      0
    )
  } else {
    const expensesAggregation = await prisma.expense.aggregate({
      where: expenseWhere,
      _sum: {
        amount: true,
      },
    })

    totalExpenses = Number(expensesAggregation._sum.amount || 0)
  }

  // Calculate COGS
  // COGS is calculated based on SKU and quantity sold
  const cogsWhere: any = {}
  if (accountId) cogsWhere.accountId = accountId
  if (sku) cogsWhere.sku = sku
  if (dateFilter) cogsWhere.purchaseDate = dateFilter

  // Get COGS records
  const cogsRecords = await prisma.cOGS.findMany({
    where: cogsWhere,
  })

  // Calculate total COGS based on quantity sold
  // For simplicity, we use FIFO (First In First Out) method
  // In production, you might want to implement weighted average or specific identification
  let totalCOGS = 0

  if (sku) {
    // If filtering by SKU, calculate COGS for that SKU
    const orderItems = await prisma.orderItem.findMany({
      where: {
        sku,
        order: orderWhere,
      },
      select: {
        quantity: true,
        createdAt: true,
      },
    })

    // Simple FIFO calculation
    const totalQuantitySold = orderItems.reduce((sum, item) => sum + item.quantity, 0)

    // Sort COGS by purchase date (FIFO)
    const sortedCOGS = cogsRecords.sort(
      (a, b) => a.purchaseDate.getTime() - b.purchaseDate.getTime()
    )

    let remainingQuantity = totalQuantitySold
    for (const cogsRecord of sortedCOGS) {
      if (remainingQuantity <= 0) break

      const quantityUsed = Math.min(remainingQuantity, cogsRecord.quantity)
      totalCOGS += Number(cogsRecord.unitCost) * quantityUsed
      remainingQuantity -= quantityUsed
    }
  } else {
    // If not filtering by SKU, sum all COGS (use totalCost which includes shipment)
    totalCOGS = cogsRecords.reduce(
      (sum, record) => sum + Number(record.totalCost),
      0
    )
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

  // Calculate COGS for each SKU
  const cogsWhere: any = {}
  if (accountId) cogsWhere.accountId = accountId
  if (dateFilter) cogsWhere.purchaseDate = dateFilter

  const cogsRecords = await prisma.cOGS.findMany({
    where: cogsWhere,
  })

  // Group COGS by SKU
  const cogsBySku = new Map<string, number>()
  for (const record of cogsRecords) {
    const existing = cogsBySku.get(record.sku) || 0
    cogsBySku.set(record.sku, existing + Number(record.totalCost))
  }

  // Calculate expenses per SKU (proportional to revenue)
  const expenseWhere: any = {}
  if (accountId) expenseWhere.accountId = accountId
  if (marketplaceId) expenseWhere.marketplaceId = marketplaceId
  if (dateFilter) expenseWhere.incurredAt = dateFilter

  const expenses = await prisma.expense.findMany({
    where: expenseWhere,
    select: {
      amount: true,
      allocatedProducts: true,
    },
  })

  const totalRevenue = Array.from(skuMap.values()).reduce((sum, b) => sum + b.salesRevenue, 0)
  const allocatedExpensesBySku = new Map<string, number>()
  let unallocatedExpenseTotal = 0

  const returnsWhere: any = {}
  if (accountId) returnsWhere.accountId = accountId
  if (marketplaceId) returnsWhere.marketplaceId = marketplaceId
  if (dateFilter) returnsWhere.createdAt = dateFilter

  const returnRecords = await prisma.return.findMany({
    where: returnsWhere,
  })

  const returnRefundBySku = new Map<string, number>()
  const returnFeesBySku = new Map<string, number>()
  for (const entry of returnRecords) {
    returnRefundBySku.set(entry.sku, (returnRefundBySku.get(entry.sku) || 0) + Number(entry.refundAmount))
    returnFeesBySku.set(entry.sku, (returnFeesBySku.get(entry.sku) || 0) + Number(entry.feeAmount))
  }

  for (const expense of expenses) {
    const allocations = parseAllocatedProducts(expense.allocatedProducts)
    if (allocations.length === 0) {
      unallocatedExpenseTotal += Number(expense.amount)
      continue
    }

    for (const allocation of allocations) {
      const existing = allocatedExpensesBySku.get(allocation.sku) || 0
      allocatedExpensesBySku.set(
        allocation.sku,
        existing + Number(expense.amount) * (allocation.percentage / 100)
      )
    }
  }

  // Calculate final metrics for each SKU
  const results: ProductProfitBreakdown[] = []

  for (const [sku, breakdown] of skuMap.entries()) {
    // Set COGS
    breakdown.totalCOGS = cogsBySku.get(sku) || 0

    // Add return refunds/fees
    breakdown.totalRefunds += returnRefundBySku.get(sku) || 0
    breakdown.totalFees += returnFeesBySku.get(sku) || 0

    // Allocate expenses: explicit allocations first, then proportional for unallocated
    breakdown.totalExpenses = allocatedExpensesBySku.get(sku) || 0
    if (totalRevenue > 0) {
      const revenueProportion = breakdown.salesRevenue / totalRevenue
      breakdown.totalExpenses += unallocatedExpenseTotal * revenueProportion
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
  if (dateFilter) expenseWhere.incurredAt = dateFilter
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

  // Add returns by marketplace
  const returnsWhere: any = {}
  if (accountId) returnsWhere.accountId = accountId
  if (dateFilter) returnsWhere.createdAt = dateFilter
  returnsWhere.marketplaceId = { not: null }

  const returnRecords = await prisma.return.findMany({
    where: returnsWhere,
  })

  for (const entry of returnRecords) {
    if (!entry.marketplaceId) continue
    const breakdown = marketplaceMap.get(entry.marketplaceId)
    if (breakdown) {
      breakdown.totalRefunds += Number(entry.refundAmount)
      breakdown.totalFees += Number(entry.feeAmount)
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
  const cogsWhere: any = {}
  if (accountId) cogsWhere.accountId = accountId
  if (dateFilter) cogsWhere.purchaseDate = dateFilter

  const cogsRecords = await prisma.cOGS.findMany({
    where: cogsWhere,
  })

  // Calculate COGS per marketplace (simplified - allocate based on SKU sales)
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
  for (const [marketplaceId, skuMap] of skuSalesByMarketplace.entries()) {
    const breakdown = marketplaceMap.get(marketplaceId)
    if (!breakdown) continue

    let marketplaceCOGS = 0
    for (const [sku, quantitySold] of skuMap.entries()) {
      const cogsForSku = cogsRecords.filter((r) => r.sku === sku)
      if (cogsForSku.length > 0) {
        // Simple FIFO
        const sortedCOGS = cogsForSku.sort(
          (a, b) => a.purchaseDate.getTime() - b.purchaseDate.getTime()
        )

        let remainingQuantity = quantitySold
        for (const cogsRecord of sortedCOGS) {
          if (remainingQuantity <= 0) break

          const quantityUsed = Math.min(remainingQuantity, cogsRecord.quantity)
          marketplaceCOGS += Number(cogsRecord.unitCost) * quantityUsed
          remainingQuantity -= quantityUsed
        }
      }
    }

    breakdown.totalCOGS = marketplaceCOGS
  }

  // Calculate final metrics
  const results: MarketplaceProfitBreakdown[] = []

  for (const [marketplaceId, breakdown] of marketplaceMap.entries()) {
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
// COUNTRY/MAP BREAKDOWN
// ============================================

/**
 * Map region code to country code
 * Converts marketplace region codes to ISO country codes for map visualization
 * 
 * @param region - Marketplace region code (e.g., "us", "uk", "de")
 * @returns Country code in uppercase (e.g., "US", "UK", "DE")
 */
function mapRegionToCountry(region: string | null | undefined): string {
  if (!region) return 'UNKNOWN'

  // Normalize region code to uppercase
  const normalized = region.toUpperCase().trim()

  // Direct mapping for common regions
  const regionToCountryMap: Record<string, string> = {
    US: 'US',
    UK: 'GB', // UK maps to GB (ISO 3166-1 alpha-2)
    GB: 'GB',
    CA: 'CA',
    DE: 'DE',
    FR: 'FR',
    IT: 'IT',
    ES: 'ES',
    JP: 'JP',
    AU: 'AU',
    IN: 'IN',
    BR: 'BR',
    MX: 'MX',
    NL: 'NL',
    SE: 'SE',
    PL: 'PL',
    TR: 'TR',
    AE: 'AE',
    SG: 'SG',
    SA: 'SA',
  }

  return regionToCountryMap[normalized] || normalized
}

/**
 * Get profit breakdown by country
 * Groups profit metrics by country/region for map visualization
 * 
 * Reuses marketplace profit calculation logic and groups by country
 * 
 * @param filters - Profit filter parameters (startDate, endDate required)
 * @param userId - User ID for access control
 * @returns Array of CountryProfitBreakdown with profit and orders per country
 */
export async function getProfitByCountry(
  filters: ProfitFilters,
  userId: string
): Promise<CountryProfitBreakdown[]> {
  const { accountId, amazonAccountId, startDate, endDate } = filters

  // Validate required parameters
  if (!startDate || !endDate) {
    throw new AppError('startDate and endDate are required', 400)
  }

  // Validate date format
  const start = new Date(startDate)
  const end = new Date(endDate)

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new AppError('Invalid date format. Use ISO format (YYYY-MM-DD)', 400)
  }

  if (start > end) {
    throw new AppError('startDate must be before or equal to endDate', 400)
  }

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
  orderWhere.marketplaceId = { not: null } // Only orders with marketplace

  // Get orders with marketplace information
  const orders = await prisma.order.findMany({
    where: orderWhere,
    include: {
      marketplaceRef: {
        select: {
          id: true,
          name: true,
          code: true,
          region: true,
        },
      },
      fees: true,
      refunds: true,
      items: true,
    },
  })

  // Get all unique SKUs from all orders for efficient COGS query
  const allSkus = new Set<string>()
  for (const order of orders) {
    for (const item of order.items) {
      allSkus.add(item.sku)
    }
  }

  // Get all COGS records for all SKUs in one query
  const cogsWhere: any = {
    accountId: accountId || undefined,
    sku: { in: Array.from(allSkus) },
    ...(dateFilter ? { purchaseDate: dateFilter } : {}),
  }

  const allCogsRecords = await prisma.cOGS.findMany({
    where: cogsWhere,
  })

  // Pre-calculate average unit cost per SKU
  const avgCogsBySku = new Map<string, number>()
  const cogsBySku = new Map<string, { totalCost: number; totalQuantity: number }>()

  for (const cogsRecord of allCogsRecords) {
    const existing = cogsBySku.get(cogsRecord.sku) || { totalCost: 0, totalQuantity: 0 }
    existing.totalCost += Number(cogsRecord.totalCost)
    existing.totalQuantity += cogsRecord.quantity
    cogsBySku.set(cogsRecord.sku, existing)
  }

  // Calculate average unit cost
  for (const [sku, data] of cogsBySku.entries()) {
    avgCogsBySku.set(sku, data.totalQuantity > 0 ? data.totalCost / data.totalQuantity : 0)
  }

  // Get all expenses in one query
  const expenseWhere: any = {
    accountId: accountId || undefined,
    ...(dateFilter ? { incurredAt: dateFilter } : {}),
  }

  const allExpenses = await prisma.expense.findMany({
    where: expenseWhere,
  })

  const totalExpenses = allExpenses.reduce((sum, e) => sum + Number(e.amount), 0)
  const totalRevenue = orders.reduce((sum, o) => sum + Number(o.totalAmount), 0)

  // Group by country (using marketplace region)
  const countryMap = new Map<string, { profit: number; orders: number }>()

  for (const order of orders) {
    if (!order.marketplaceId || !order.marketplaceRef) continue

    // Map marketplace region to country code
    const country = mapRegionToCountry(order.marketplaceRef.region)

    if (!countryMap.has(country)) {
      countryMap.set(country, {
        profit: 0,
        orders: 0,
      })
    }

    const countryData = countryMap.get(country)!

    // Calculate order-level metrics
    const salesRevenue = Number(order.totalAmount)
    const fees = order.fees.reduce((sum, fee) => sum + Number(fee.amount), 0)
    const refunds = order.refunds.reduce((sum, refund) => sum + Number(refund.amount), 0)

    // Calculate COGS for this order using pre-calculated averages
    let orderCOGS = 0
    for (const item of order.items) {
      const avgUnitCost = avgCogsBySku.get(item.sku) || 0
      orderCOGS += avgUnitCost * item.quantity
    }

    // Allocate expenses proportionally based on revenue
    const orderExpenses = totalRevenue > 0 ? (totalExpenses * salesRevenue) / totalRevenue : 0

    // Calculate net profit for this order
    // Net Profit = Sales Revenue - COGS - Fees - Refunds - Expenses
    const netProfit = salesRevenue - orderCOGS - fees - refunds - orderExpenses

    countryData.profit += netProfit
    countryData.orders += 1
  }

  // Convert map to array format
  const results: CountryProfitBreakdown[] = Array.from(countryMap.entries()).map(([country, data]) => ({
    country,
    profit: Number(data.profit.toFixed(2)),
    orders: data.orders,
  }))

  // Sort by profit descending
  return results.sort((a, b) => b.profit - a.profit)
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
  const { accountId, amazonAccountId, marketplaceId, sku, startDate, endDate, period = 'day' } =
    filters

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

  for (const order of orders) {
    let periodKey: string
    let periodLabel: string

    const orderDate = order.orderDate

    switch (period) {
      case 'week':
        // Get week start (Monday)
        const weekStart = new Date(orderDate)
        weekStart.setDate(orderDate.getDate() - orderDate.getDay() + 1)
        periodKey = weekStart.toISOString().split('T')[0]
        periodLabel = `Week of ${periodKey}`
        break
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
  }

  // Get expenses by period
  const expenseWhere: any = {
    accountId: accountId || undefined,
    marketplaceId: marketplaceId || undefined,
    incurredAt: {
      gte: start,
      lte: end,
    },
  }

  const expenses = await prisma.expense.findMany({
    where: expenseWhere,
  })

  // Allocate expenses to periods
  for (const expense of expenses) {
    const expenseDate = expense.incurredAt
    let periodKey: string

    switch (period) {
      case 'week':
        const weekStart = new Date(expenseDate)
        weekStart.setDate(expenseDate.getDate() - expenseDate.getDay() + 1)
        periodKey = weekStart.toISOString().split('T')[0]
        break
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
      if (sku) {
        const allocated = getAllocatedExpenseAmount(expense, sku)
        if (allocated > 0) {
          trendData.totalExpenses += allocated
        }
      } else {
        trendData.totalExpenses += Number(expense.amount)
      }
    }
  }

  // Add returns by period
  const returnsWhere: any = {
    accountId: accountId || undefined,
    marketplaceId: marketplaceId || undefined,
  }

  if (sku) {
    returnsWhere.sku = sku
  }

  returnsWhere.createdAt = {
    gte: start,
    lte: end,
  }

  const returnRecords = await prisma.return.findMany({
    where: returnsWhere,
  })

  for (const entry of returnRecords) {
    const returnDate = entry.createdAt
    let periodKey: string

    switch (period) {
      case 'week': {
        const weekStart = new Date(returnDate)
        weekStart.setDate(returnDate.getDate() - returnDate.getDay() + 1)
        periodKey = weekStart.toISOString().split('T')[0]
        break
      }
      case 'month':
        periodKey = `${returnDate.getFullYear()}-${String(returnDate.getMonth() + 1).padStart(2, '0')}`
        break
      case 'day':
      default:
        periodKey = returnDate.toISOString().split('T')[0]
        break
    }

    const trendData = periodMap.get(periodKey)
    if (trendData) {
      trendData.totalRefunds += Number(entry.refundAmount)
      trendData.totalFees += Number(entry.feeAmount)
    }
  }

  // Calculate COGS by period (simplified)
  const cogsWhere: any = {
    accountId: accountId || undefined,
    purchaseDate: {
      gte: start,
      lte: end,
    },
  }

  if (sku) {
    cogsWhere.sku = sku
  }

  const cogsRecords = await prisma.cOGS.findMany({
    where: cogsWhere,
  })

  // Allocate COGS to periods (simplified - based on purchase date)
  for (const cogsRecord of cogsRecords) {
    const purchaseDate = cogsRecord.purchaseDate
    let periodKey: string

    switch (period) {
      case 'week':
        const weekStart = new Date(purchaseDate)
        weekStart.setDate(purchaseDate.getDate() - purchaseDate.getDay() + 1)
        periodKey = weekStart.toISOString().split('T')[0]
        break
      case 'month':
        periodKey = `${purchaseDate.getFullYear()}-${String(purchaseDate.getMonth() + 1).padStart(2, '0')}`
        break
      case 'day':
      default:
        periodKey = purchaseDate.toISOString().split('T')[0]
        break
    }

    const trendData = periodMap.get(periodKey)
    if (trendData) {
      // Simplified: allocate COGS based on purchase date
      // In production, you'd want to match COGS to actual sales
      trendData.totalCOGS += Number(cogsRecord.totalCost)
    }
  }

  // Calculate final metrics for each period
  const results: ProfitTrendData[] = []

  for (const [periodKey, trendData] of periodMap.entries()) {
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

/**
 * Get simplified profit trends for Trends screen
 * Returns profit and revenue arrays for easy chart consumption
 * 
 * This function reuses getProfitTrends logic but formats the response
 * in a simplified structure optimized for frontend charts
 * 
 * Architecture Note: This service function is self-contained and can be
 * extracted to a microservice in the future. It only depends on:
 * - Database (Prisma)
 * - Helper functions (verifyAccountAccess, buildDateFilter, calculateProfitMetrics)
 * - Types (ProfitFilters, ProfitTrendsSimpleResponse)
 * 
 * @param filters - Filter parameters including startDate, endDate, interval
 * @param userId - User ID for access control
 * @returns Simplified trends response with labels, profit, and revenue arrays
 */
export async function getProfitTrendsSimple(
  filters: ProfitFilters & { interval?: 'daily' | 'weekly' | 'monthly' },
  userId: string
): Promise<ProfitTrendsSimpleResponse> {
  const { interval = 'daily', startDate, endDate } = filters

  // Validate required parameters
  if (!startDate || !endDate) {
    throw new AppError('startDate and endDate are required', 400)
  }

  // Validate date format
  const start = new Date(startDate)
  const end = new Date(endDate)

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new AppError('Invalid date format. Use ISO format (YYYY-MM-DD)', 400)
  }

  if (start > end) {
    throw new AppError('startDate must be before or equal to endDate', 400)
  }

  // Validate interval
  if (!['daily', 'weekly', 'monthly'].includes(interval)) {
    throw new AppError('interval must be one of: daily, weekly, monthly', 400)
  }

  // Verify account access
  if (filters.accountId) {
    await verifyAccountAccess(userId, filters.accountId)
  }

  if (filters.amazonAccountId) {
    await verifyAmazonAccountAccess(userId, filters.amazonAccountId)
  }

  // Map interval to period format used by getProfitTrends
  const periodMap: Record<string, 'day' | 'week' | 'month'> = {
    daily: 'day',
    weekly: 'week',
    monthly: 'month',
  }
  const period = periodMap[interval]

  // Reuse existing getProfitTrends logic
  const trendsData = await getProfitTrends(
    {
      ...filters,
      period,
    },
    userId
  )

  // Transform to simplified format
  const labels: string[] = []
  const profit: number[] = []
  const revenue: number[] = []

  for (const item of trendsData.data) {
    labels.push(item.date)
    profit.push(Number(item.netProfit.toFixed(2)))
    revenue.push(Number(item.salesRevenue.toFixed(2)))
  }

  return {
    labels,
    profit,
    revenue,
  }
}

/**
 * Get product-level trends for Trends screen
 * Returns daily metric values for each product
 * 
 * This function calculates product-level metrics grouped by day
 * and returns them in a format optimized for the Trends table view
 * 
 * Architecture Note: This service function is self-contained and can be
 * extracted to a microservice in the future. It only depends on:
 * - Database (Prisma)
 * - Helper functions (verifyAccountAccess, buildDateFilter, calculateProfitMetrics)
 * - Types (ProfitFilters, ProductTrendsResponse)
 * 
 * @param filters - Filter parameters including startDate, endDate, metric
 * @param userId - User ID for access control
 * @returns Product trends response with daily values per product
 */
export async function getProductTrends(
  filters: ProfitFilters & { metric?: string },
  userId: string
): Promise<ProductTrendsResponse> {
  const { metric = 'sales', startDate, endDate, accountId, marketplaceId } = filters

  // Validate required parameters
  if (!startDate || !endDate) {
    throw new AppError('startDate and endDate are required', 400)
  }

  // Validate date format
  const start = new Date(startDate)
  const end = new Date(endDate)

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new AppError('Invalid date format. Use ISO format (YYYY-MM-DD)', 400)
  }

  if (start > end) {
    throw new AppError('startDate must be before or equal to endDate', 400)
  }

  // Validate metric
  const validMetrics = [
    'sales',
    'units',
    'orders',
    'promo',
    'advertisingCost',
    'refunds',
    'refundCost',
    'refundsPercent',
    'sellableReturns',
    'amazonFees',
    'estimatedPayout',
    'costOfGoods',
    'grossProfit',
    'indirectExpenses',
    'netProfit',
    'margin',
  ]
  if (!validMetrics.includes(metric)) {
    throw new AppError(`metric must be one of: ${validMetrics.join(', ')}`, 400)
  }

  // Verify account access
  if (accountId) {
    await verifyAccountAccess(userId, accountId)
  }

  const dateFilter = buildDateFilter(startDate, endDate)

  // Build where clause for orders
  const orderWhere: any = {}
  if (accountId) orderWhere.accountId = accountId
  if (marketplaceId) orderWhere.marketplaceId = marketplaceId
  if (dateFilter) orderWhere.orderDate = dateFilter

  // Get all order items in date range with product info
  const orderItems = await prisma.orderItem.findMany({
    where: {
      order: orderWhere,
    },
    include: {
      product: {
        select: {
          id: true,
          title: true,
          imageUrl: true,
        },
      },
      order: {
        include: {
          fees: true,
          refunds: true,
        },
      },
    },
    orderBy: {
      order: {
        orderDate: 'asc',
      },
    },
  })

  // Generate all dates in range
  const dates: string[] = []
  const currentDate = new Date(start)
  while (currentDate <= end) {
    dates.push(currentDate.toISOString().split('T')[0])
    currentDate.setDate(currentDate.getDate() + 1)
  }

  // Group order items by product (SKU)
  const productMap = new Map<
    string,
    {
      productId: string
      sku: string
      productTitle: string | null
      productImageUrl: string | null
      items: typeof orderItems
    }
  >()

  for (const item of orderItems) {
    const sku = item.sku
    if (!productMap.has(sku)) {
      productMap.set(sku, {
        productId: item.productId,
        sku,
        productTitle: item.product?.title || null,
        productImageUrl: item.product?.imageUrl || null,
        items: [],
      })
    }
    productMap.get(sku)!.items.push(item)
  }

  // Get COGS data for calculating product-level COGS
  const cogsWhere: any = {}
  if (accountId) cogsWhere.accountId = accountId
  if (marketplaceId) cogsWhere.marketplaceId = marketplaceId

  const cogsRecords = await prisma.cOGS.findMany({
    where: cogsWhere,
  })

  // Group COGS by SKU and calculate average unit cost
  const cogsBySku = new Map<string, number>()
  const cogsQuantityBySku = new Map<string, number>()
  for (const record of cogsRecords) {
    const existingCost = cogsBySku.get(record.sku) || 0
    const existingQty = cogsQuantityBySku.get(record.sku) || 0
    cogsBySku.set(record.sku, existingCost + Number(record.totalCost))
    cogsQuantityBySku.set(record.sku, existingQty + record.quantity)
  }

  const avgCogsBySku = new Map<string, number>()
  for (const [sku, totalCost] of cogsBySku.entries()) {
    const totalQty = cogsQuantityBySku.get(sku) || 1
    avgCogsBySku.set(sku, totalCost / totalQty)
  }

  // Get expenses for allocation
  const expenseWhere: any = {}
  if (accountId) expenseWhere.accountId = accountId
  if (marketplaceId) expenseWhere.marketplaceId = marketplaceId
  if (dateFilter) expenseWhere.incurredAt = dateFilter

  const expenses = await prisma.expense.findMany({
    where: expenseWhere,
  })

  const totalRevenue = orderItems.reduce((sum, item) => sum + Number(item.totalPrice), 0)

  // Get returns for sellable returns calculation
  const returns = await prisma.return.findMany({
    where: {
      accountId: accountId || undefined,
      marketplaceId: marketplaceId || undefined,
      createdAt: dateFilter || undefined,
    },
  })

  // Group returns by SKU
  const returnsBySku = new Map<string, { total: number; sellable: number }>()
  for (const returnRecord of returns) {
    const existing = returnsBySku.get(returnRecord.sku) || { total: 0, sellable: 0 }
    existing.total += returnRecord.quantityReturned
    if (returnRecord.isSellable) {
      existing.sellable += returnRecord.quantityReturned
    }
    returnsBySku.set(returnRecord.sku, existing)
  }

  // Calculate daily values for each product
  const products = Array.from(productMap.values()).map((product) => {
    // Group items by date
    const dailyItemsMap = new Map<string, typeof orderItems>()

    for (const item of product.items) {
      const orderDate = item.order.orderDate.toISOString().split('T')[0]
      if (!dailyItemsMap.has(orderDate)) {
        dailyItemsMap.set(orderDate, [])
      }
      dailyItemsMap.get(orderDate)!.push(item)
    }

    // Calculate metric value for each date
    const dailyValues: ProductTrendDateValue[] = []
    let previousValue = 0

    for (const date of dates) {
      const dayItems = dailyItemsMap.get(date) || []
      let value = 0

      // Calculate metric based on selected metric type
      switch (metric) {
        case 'sales':
          value = dayItems.reduce((sum, item) => sum + Number(item.totalPrice), 0)
          break
        case 'units':
          value = dayItems.reduce((sum, item) => sum + item.quantity, 0)
          break
        case 'orders':
          value = new Set(dayItems.map((item) => item.orderId)).size
          break
        case 'promo':
          // TODO: Calculate promo/discounts
          value = 0
          break
        case 'advertisingCost':
          // TODO: Get advertising cost for this product on this date
          value = 0
          break
        case 'refunds':
          value = dayItems.reduce((sum, item) => {
            return sum + item.order.refunds.filter((r) => r.sku === item.sku).length
          }, 0)
          break
        case 'refundCost':
          // Calculate refund cost for this product on this date
          const dayRefunds = returns.filter(
            (r) => r.sku === product.sku && r.createdAt.toISOString().split('T')[0] === date
          )
          value = dayRefunds.reduce((sum, r) => sum + Number(r.refundAmount || 0), 0)
          break
        case 'refundsPercent':
          const daySales = dayItems.reduce((sum, item) => sum + Number(item.totalPrice), 0)
          const dayRefundAmount = returns
            .filter((r) => r.sku === product.sku && r.createdAt.toISOString().split('T')[0] === date)
            .reduce((sum, r) => sum + Number(r.refundAmount || 0), 0)
          value = daySales > 0 ? (dayRefundAmount / daySales) * 100 : 0
          break
        case 'sellableReturns':
          const dayReturns = returns.filter(
            (r) => r.sku === product.sku && r.createdAt.toISOString().split('T')[0] === date
          )
          const sellableCount = dayReturns.filter((r) => r.isSellable).length
          value = dayReturns.length > 0 ? (sellableCount / dayReturns.length) * 100 : 0
          break
        case 'amazonFees':
          value = dayItems.reduce((sum, item) => {
            const orderFees = item.order.fees.reduce((feeSum, fee) => feeSum + Number(fee.amount), 0)
            const orderTotal = Number(item.order.totalAmount)
            const itemProportion = orderTotal > 0 ? Number(item.totalPrice) / orderTotal : 0
            return sum + orderFees * itemProportion
          }, 0)
          break
        case 'estimatedPayout':
          const daySales2 = dayItems.reduce((sum, item) => sum + Number(item.totalPrice), 0)
          const dayFees = dayItems.reduce((sum, item) => {
            const orderFees = item.order.fees.reduce((feeSum, fee) => feeSum + Number(fee.amount), 0)
            const orderTotal = Number(item.order.totalAmount)
            const itemProportion = orderTotal > 0 ? Number(item.totalPrice) / orderTotal : 0
            return sum + orderFees * itemProportion
          }, 0)
          const dayRefunds2 = returns
            .filter((r) => r.sku === product.sku && r.createdAt.toISOString().split('T')[0] === date)
            .reduce((sum, r) => sum + Number(r.refundAmount || 0), 0)
          const dayExpenses =
            totalRevenue > 0
              ? (expenses.reduce((sum, exp) => sum + Number(exp.amount), 0) *
                  dayItems.reduce((sum, item) => sum + Number(item.totalPrice), 0)) /
                totalRevenue
              : 0
          value = daySales2 - dayFees - dayRefunds2 - dayExpenses
          break
        case 'costOfGoods':
          const avgCogs = avgCogsBySku.get(product.sku) || 0
          value = dayItems.reduce((sum, item) => sum + avgCogs * item.quantity, 0)
          break
        case 'grossProfit':
          const daySales3 = dayItems.reduce((sum, item) => sum + Number(item.totalPrice), 0)
          const dayCogs = (avgCogsBySku.get(product.sku) || 0) * dayItems.reduce((sum, item) => sum + item.quantity, 0)
          const dayFees2 = dayItems.reduce((sum, item) => {
            const orderFees = item.order.fees.reduce((feeSum, fee) => feeSum + Number(fee.amount), 0)
            const orderTotal = Number(item.order.totalAmount)
            const itemProportion = orderTotal > 0 ? Number(item.totalPrice) / orderTotal : 0
            return sum + orderFees * itemProportion
          }, 0)
          value = daySales3 - dayCogs - dayFees2
          break
        case 'indirectExpenses':
          value =
            totalRevenue > 0
              ? (expenses.reduce((sum, exp) => sum + Number(exp.amount), 0) *
                  dayItems.reduce((sum, item) => sum + Number(item.totalPrice), 0)) /
                totalRevenue
              : 0
          break
        case 'netProfit':
          const daySales4 = dayItems.reduce((sum, item) => sum + Number(item.totalPrice), 0)
          const dayCogs2 = (avgCogsBySku.get(product.sku) || 0) * dayItems.reduce((sum, item) => sum + item.quantity, 0)
          const dayFees3 = dayItems.reduce((sum, item) => {
            const orderFees = item.order.fees.reduce((feeSum, fee) => feeSum + Number(fee.amount), 0)
            const orderTotal = Number(item.order.totalAmount)
            const itemProportion = orderTotal > 0 ? Number(item.totalPrice) / orderTotal : 0
            return sum + orderFees * itemProportion
          }, 0)
          const dayExpenses2 =
            totalRevenue > 0
              ? (expenses.reduce((sum, exp) => sum + Number(exp.amount), 0) *
                  dayItems.reduce((sum, item) => sum + Number(item.totalPrice), 0)) /
                totalRevenue
              : 0
          value = daySales4 - dayCogs2 - dayFees3 - dayExpenses2
          break
        case 'margin':
          const daySales5 = dayItems.reduce((sum, item) => sum + Number(item.totalPrice), 0)
          const dayCogs3 = (avgCogsBySku.get(product.sku) || 0) * dayItems.reduce((sum, item) => sum + item.quantity, 0)
          const dayFees4 = dayItems.reduce((sum, item) => {
            const orderFees = item.order.fees.reduce((feeSum, fee) => feeSum + Number(fee.amount), 0)
            const orderTotal = Number(item.order.totalAmount)
            const itemProportion = orderTotal > 0 ? Number(item.totalPrice) / orderTotal : 0
            return sum + orderFees * itemProportion
          }, 0)
          const dayExpenses3 =
            totalRevenue > 0
              ? (expenses.reduce((sum, exp) => sum + Number(exp.amount), 0) *
                  dayItems.reduce((sum, item) => sum + Number(item.totalPrice), 0)) /
                totalRevenue
              : 0
          const dayNetProfit = daySales5 - dayCogs3 - dayFees4 - dayExpenses3
          value = daySales5 > 0 ? (dayNetProfit / daySales5) * 100 : 0
          break
        default:
          value = 0
      }

      // Calculate percentage change
      const changePercent = previousValue !== 0 ? ((value - previousValue) / Math.abs(previousValue)) * 100 : 0

      dailyValues.push({
        date,
        value: Number(value.toFixed(2)),
        changePercent: Number(changePercent.toFixed(2)),
      })

      previousValue = value
    }

    // Generate chart data (just the values array)
    const chartData = dailyValues.map((dv) => dv.value)

    return {
      productId: product.productId,
      sku: product.sku,
      productTitle: product.productTitle,
      productImageUrl: product.productImageUrl,
      dailyValues,
      chartData,
    }
  })

  return {
    products,
    dates,
    metric,
  }
}

// ============================================
// ORDER ITEMS BREAKDOWN
// ============================================

/**
 * Get profit breakdown by order items
 * Returns profit metrics for individual order items
 * 
 * Performance: Fetches order items with related data in a single query
 */
export async function getProfitByOrderItems(
  filters: ProfitFilters,
  userId: string
): Promise<OrderItemProfitBreakdown[]> {
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

  // Get order items with all related data
  const orderItems = await prisma.orderItem.findMany({
    where: {
      order: orderWhere,
    },
    include: {
      product: {
        select: {
          id: true,
          title: true,
          imageUrl: true,
        },
      },
      order: {
        include: {
          fees: true,
          refunds: true,
          marketplaceRef: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  })

  // Get COGS data for calculating item-level COGS
  const cogsWhere: any = {}
  if (accountId) cogsWhere.accountId = accountId
  if (marketplaceId) cogsWhere.marketplaceId = marketplaceId

  const cogsRecords = await prisma.cOGS.findMany({
    where: cogsWhere,
  })

  // Group COGS by SKU and calculate average unit cost
  const cogsBySku = new Map<string, number>()
  const cogsQuantityBySku = new Map<string, number>()
  for (const record of cogsRecords) {
    const existingCost = cogsBySku.get(record.sku) || 0
    const existingQty = cogsQuantityBySku.get(record.sku) || 0
    cogsBySku.set(record.sku, existingCost + Number(record.totalCost))
    cogsQuantityBySku.set(record.sku, existingQty + record.quantity)
  }

  // Calculate average unit COGS per SKU
  const avgCogsBySku = new Map<string, number>()
  for (const [sku, totalCost] of cogsBySku.entries()) {
    const totalQty = cogsQuantityBySku.get(sku) || 1
    avgCogsBySku.set(sku, totalCost / totalQty)
  }

  // Get expenses for allocation
  const expenseWhere: any = {}
  if (accountId) expenseWhere.accountId = accountId
  if (marketplaceId) expenseWhere.marketplaceId = marketplaceId
  if (dateFilter) expenseWhere.incurredAt = dateFilter

  const expenses = await prisma.expense.findMany({
    where: expenseWhere,
  })

  // Calculate total revenue for expense allocation
  const totalRevenue = orderItems.reduce((sum, item) => sum + Number(item.totalPrice), 0)

  // Get returns for sellable returns calculation
  const returns = await prisma.return.findMany({
    where: {
      accountId: accountId || undefined,
      marketplaceId: marketplaceId || undefined,
      createdAt: dateFilter || undefined,
    },
  })

  // Group returns by SKU
  const returnsBySku = new Map<string, { total: number; sellable: number }>()
  for (const returnRecord of returns) {
    const existing = returnsBySku.get(returnRecord.sku) || { total: 0, sellable: 0 }
    existing.total += returnRecord.quantityReturned
    if (returnRecord.isSellable) {
      existing.sellable += returnRecord.quantityReturned
    }
    returnsBySku.set(returnRecord.sku, existing)
  }

  // Build result array
  const results: OrderItemProfitBreakdown[] = []

  for (const item of orderItems) {
    const order = item.order
    const orderTotal = Number(order.totalAmount)
    const itemProportion = orderTotal > 0 ? Number(item.totalPrice) / orderTotal : 0

    // Calculate fees (proportional to item value)
    const orderFees = order.fees.reduce((sum, fee) => sum + Number(fee.amount), 0)
    const itemFees = orderFees * itemProportion

    // Calculate refunds count
    const orderRefunds = order.refunds
    const refundCount = orderRefunds.length

    // Calculate sellable returns percentage
    const skuReturns = returnsBySku.get(item.sku) || { total: 0, sellable: 0 }
    const sellableReturnsPercent =
      skuReturns.total > 0 ? (skuReturns.sellable / skuReturns.total) * 100 : 0

    // Get COGS for this SKU
    const avgCogs = avgCogsBySku.get(item.sku) || 0
    const itemCogs = avgCogs * item.quantity

    // Allocate expenses (proportional to revenue)
    const itemExpenses =
      totalRevenue > 0 ? (expenses.reduce((sum, exp) => sum + Number(exp.amount), 0) * Number(item.totalPrice)) / totalRevenue : 0

    // Calculate profits
    const grossProfit = Number(item.totalPrice) - itemCogs - itemFees
    const netProfit = grossProfit - itemExpenses

    results.push({
      id: item.id,
      orderId: order.id,
      orderNumber: order.orderId,
      orderDate: order.orderDate.toISOString(),
      orderStatus: order.orderStatus,
      shipDate: order.shipDate?.toISOString() || null,
      marketplace: order.marketplaceRef?.name || order.marketplace || 'Unknown',
      marketplaceCode: order.marketplaceRef?.code || 'unknown',
      productId: item.productId,
      sku: item.sku,
      productTitle: item.product?.title || null,
      productImageUrl: item.product?.imageUrl || null,
      unitPrice: Number(item.unitPrice),
      quantity: item.quantity,
      salesRevenue: Number(item.totalPrice),
      refundCount,
      sellableReturnsPercent: Number(sellableReturnsPercent.toFixed(2)),
      amazonFees: Number(itemFees.toFixed(2)),
      cogs: Number(itemCogs.toFixed(2)),
      grossProfit: Number(grossProfit.toFixed(2)),
      expenses: Number(itemExpenses.toFixed(2)),
      netProfit: Number(netProfit.toFixed(2)),
      coupon: null, // TODO: Add coupon support if needed
      comment: null, // TODO: Add comment support if needed
      currency: order.currency || 'USD',
    })
  }

  return results
}

// ============================================
// P&L (PROFIT & LOSS) BY PERIODS
// ============================================

/**
 * Get P&L data grouped by periods
 * Returns financial metrics for current month-to-date and past 12 months
 */
export async function getPLByPeriods(
  filters: ProfitFilters,
  userId: string
): Promise<PLResponse> {
  const { accountId, marketplaceId } = filters

  if (!accountId) {
    throw new AppError('accountId is required', 400)
  }

  await verifyAccountAccess(userId, accountId)

  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth()
  const currentDay = now.getDate()

  // Generate periods: current month-to-date + past 12 months
  const periods: Array<{ key: string; label: string; startDate: Date; endDate: Date }> = []

  // Current month-to-date
  const currentMonthStart = new Date(currentYear, currentMonth, 1)
  const currentMonthEnd = new Date(currentYear, currentMonth, currentDay, 23, 59, 59, 999)
  periods.push({
    key: `current-mtd`,
    label: `1-${currentDay} ${now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`,
    startDate: currentMonthStart,
    endDate: currentMonthEnd,
  })

  // Past 12 months
  for (let i = 1; i <= 12; i++) {
    const monthDate = new Date(currentYear, currentMonth - i, 1)
    const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1)
    const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0, 23, 59, 59, 999)
    const monthKey = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`
    const monthLabel = monthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    
    periods.push({
      key: monthKey,
      label: monthLabel,
      startDate: monthStart,
      endDate: monthEnd,
    })
  }

  // Get Amazon account IDs for this user to query PPC metrics
  // Note: AmazonAccount doesn't have accountId field, so we get all user's Amazon accounts
  // In the future, we might need to link AmazonAccount to Account through a relationship
  const amazonAccounts = await prisma.amazonAccount.findMany({
    where: {
      userId,
      isActive: true,
    },
    select: {
      id: true,
    },
  })
  const amazonAccountIds = amazonAccounts.map((acc) => acc.id)

  // Calculate metrics for each period
  const periodDataMap = new Map<string, any>()
  const periodChildDataMap = new Map<string, any>()

  for (const period of periods) {
    const periodFilters: ProfitFilters = {
      accountId,
      marketplaceId,
      startDate: period.startDate.toISOString().split('T')[0],
      endDate: period.endDate.toISOString().split('T')[0],
    }

    const summary = await getProfitSummary(periodFilters, userId)

    // Get additional metrics
    const dateFilter = buildDateFilter(period.startDate.toISOString().split('T')[0], period.endDate.toISOString().split('T')[0])
    
    // Get orders for units and refunds count
    const orders = await prisma.order.findMany({
      where: {
        accountId,
        ...(marketplaceId ? { marketplaceId } : {}),
        ...(dateFilter ? { orderDate: dateFilter } : {}),
      },
      include: {
        items: true,
        refunds: true,
      },
    })

    const totalUnits = orders.reduce((sum, order) => {
      return sum + order.items.reduce((itemSum, item) => itemSum + item.quantity, 0)
    }, 0)

    const refundCount = orders.reduce((sum, order) => sum + order.refunds.length, 0)

    // Get promo/discounts (from order items or fees)
    const promoAmount = orders.reduce((sum, order) => {
      // Calculate promo as difference between list price and actual price
      // For now, we'll use a simplified calculation
      return sum
    }, 0)

    // Get PPC metrics for sponsored sales/units breakdown
    let sponsoredProductsSales = 0
    let sponsoredProductsUnits = 0
    let sponsoredDisplaySales = 0
    let sponsoredDisplayUnits = 0
    let sponsoredProductsCost = 0
    let sponsoredBrandsVideoCost = 0
    let sponsoredBrandsCost = 0
    let sponsoredDisplayCost = 0

    if (amazonAccountIds.length > 0) {
      const ppcMetrics = await prisma.pPCMetric.findMany({
        where: {
          amazonAccountId: { in: amazonAccountIds },
          ...(marketplaceId ? { marketplaceId } : {}),
          ...(dateFilter ? { date: dateFilter } : {}),
        },
      })

      // Get campaign info to determine campaign type
      const campaignIds = [...new Set(ppcMetrics.map((m) => m.campaignId))]
      const campaigns = await prisma.pPC_Campaign.findMany({
        where: {
          campaignId: { in: campaignIds },
        },
      })
      const campaignMap = new Map(campaigns.map((c) => [c.campaignId, c]))

      // Helper to determine campaign type from name
      const getCampaignType = (campaignName: string): string => {
        const name = campaignName.toLowerCase()
        if (name.includes('sponsored products') || name.includes('sp')) {
          return 'sponsored-products'
        } else if (name.includes('sponsored brands video') || name.includes('sbv')) {
          return 'sponsored-brands-video'
        } else if (name.includes('sponsored brands') || name.includes('sb')) {
          return 'sponsored-brands'
        } else if (name.includes('sponsored display') || name.includes('sd')) {
          return 'sponsored-display'
        }
        return 'sponsored-products' // Default
      }

      for (const metric of ppcMetrics) {
        const campaign = campaignMap.get(metric.campaignId)
        const campaignType = campaign ? getCampaignType(campaign.name) : 'sponsored-products'
        const sales = Number(metric.sales || 0)
        const spend = Number(metric.spend || 0)

        // For units, we'll estimate based on sales (assuming average order value)
        // In a real scenario, you'd track units from PPC metrics if available
        const estimatedUnits = sales > 0 ? Math.round(sales / (summary.salesRevenue / totalUnits || 1)) : 0

        if (campaignType === 'sponsored-products') {
          sponsoredProductsSales += sales
          sponsoredProductsUnits += estimatedUnits
          sponsoredProductsCost += spend
        } else if (campaignType === 'sponsored-brands-video') {
          sponsoredBrandsVideoCost += spend
        } else if (campaignType === 'sponsored-brands') {
          sponsoredBrandsCost += spend
        } else if (campaignType === 'sponsored-display') {
          sponsoredDisplaySales += sales
          sponsoredDisplayUnits += estimatedUnits
          sponsoredDisplayCost += spend
        }
      }
    }

    // Calculate organic sales/units (total - sponsored)
    const organicSales = summary.salesRevenue - sponsoredProductsSales - sponsoredDisplaySales
    const organicUnits = totalUnits - sponsoredProductsUnits - sponsoredDisplayUnits

    // Get advertising costs (expenses with category 'Advertising')
    const advertisingExpenses = await prisma.expense.findMany({
      where: {
        accountId,
        ...(marketplaceId ? { marketplaceId } : {}),
        ...(dateFilter ? { incurredAt: dateFilter } : {}),
        category: 'Advertising',
      },
    })
    const advertisingCost = advertisingExpenses.reduce((sum, exp) => sum + Number(exp.amount), 0)
    
    // Total advertising cost includes PPC spend
    const totalAdvertisingCost = advertisingCost + sponsoredProductsCost + sponsoredBrandsVideoCost + sponsoredBrandsCost + sponsoredDisplayCost

    // Get shipping costs (expenses with category 'Shipping' + fees with feeType 'FBA shipping chargeback')
    const shippingExpenses = await prisma.expense.findMany({
      where: {
        accountId,
        ...(marketplaceId ? { marketplaceId } : {}),
        ...(dateFilter ? { incurredAt: dateFilter } : {}),
        category: 'Shipping',
      },
    })
    const shippingCostsFromExpenses = shippingExpenses.reduce((sum, exp) => sum + Number(exp.amount), 0)

    // Get FBA shipping chargeback fees from orders
    const orderIds = orders.map((o) => o.id)
    const fbaShippingFees = orderIds.length > 0 ? await prisma.fee.findMany({
      where: {
        orderId: { in: orderIds },
        feeType: { in: ['FBA shipping chargeback', 'FBA Shipping Chargeback', 'Shipping'] },
        ...(dateFilter ? { timestamp: dateFilter } : {}),
      },
    }) : []
    const fbaShippingChargeback = fbaShippingFees.reduce((sum, fee) => sum + Number(fee.amount), 0)
    
    const shippingCosts = shippingCostsFromExpenses + fbaShippingChargeback

    // Get giftwrap (expenses with category 'Giftwrap' or from orders)
    const giftwrapExpenses = await prisma.expense.findMany({
      where: {
        accountId,
        ...(marketplaceId ? { marketplaceId } : {}),
        ...(dateFilter ? { incurredAt: dateFilter } : {}),
        category: 'Giftwrap',
      },
    })
    const giftwrap = giftwrapExpenses.reduce((sum, exp) => sum + Number(exp.amount), 0)

    // Get refund cost (from returns)
    const returns = await prisma.return.findMany({
      where: {
        accountId,
        ...(marketplaceId ? { marketplaceId } : {}),
        ...(dateFilter ? { createdAt: dateFilter } : {}),
      },
      include: {
        order: {
          include: {
            items: true,
            fees: true,
          },
        },
      },
    })
    
    // Calculate refund cost breakdown
    let valueOfReturnedItems = 0 // Positive (credit)
    let refundedReferralFee = 0 // Positive (credit)
    let refundPromotion = 0 // Positive (credit)
    let refundShipPromotion = 0 // Positive (credit)
    let refundFbaShippingChargeback = 0 // Positive (credit)
    let refundDigitalServicesFee = 0 // Positive (credit)
    let refundedShipping = 0 // Negative (cost)
    let refundCommission = 0 // Negative (cost)
    let unsellableProductsCosts = 0 // Negative (cost)
    let refundedAmount = 0 // Negative (cost) - total refunded amount

    const refundedOrderIds = returns.map((r) => r.orderId)
    const refundedOrderFees = refundedOrderIds.length > 0 ? await prisma.fee.findMany({
      where: {
        orderId: { in: refundedOrderIds },
        ...(dateFilter ? { timestamp: dateFilter } : {}),
      },
    }) : []

    // Group fees by orderId for easier lookup
    const feesByOrderId = new Map<string, typeof refundedOrderFees>()
    for (const fee of refundedOrderFees) {
      if (!feesByOrderId.has(fee.orderId)) {
        feesByOrderId.set(fee.orderId, [])
      }
      feesByOrderId.get(fee.orderId)!.push(fee)
    }

    for (const ret of returns) {
      const orderFees = feesByOrderId.get(ret.orderId) || []
      
      // Value of returned items (positive - credit back)
      // This is the value of the items being returned (unit price * quantity returned)
      const orderItem = ret.order.items.find((item) => item.sku === ret.sku)
      if (orderItem) {
        // Calculate per-unit value: totalPrice / quantity, then multiply by quantityReturned
        const unitValue = Number(orderItem.totalPrice) / orderItem.quantity
        valueOfReturnedItems += unitValue * ret.quantityReturned
      }

      // Refunded amount (negative - cost)
      refundedAmount += Number(ret.refundAmount)

      // Categorize fees
      for (const fee of orderFees) {
        const feeType = fee.feeType.toLowerCase()
        const feeAmount = Number(fee.amount)

        if (feeType.includes('referral') && feeAmount < 0) {
          // Refunded referral fee (positive - credit back)
          refundedReferralFee += Math.abs(feeAmount)
        } else if (feeType.includes('promotion') && !feeType.includes('ship')) {
          // Promotion (positive - credit back)
          refundPromotion += Math.abs(feeAmount)
        } else if (feeType.includes('ship') && feeType.includes('promotion')) {
          // Ship Promotion (positive - credit back)
          refundShipPromotion += Math.abs(feeAmount)
        } else if (feeType.includes('fba') && feeType.includes('shipping') && feeType.includes('chargeback')) {
          // FBA shipping chargeback (positive - credit back)
          refundFbaShippingChargeback += Math.abs(feeAmount)
        } else if (feeType.includes('digital') || feeType.includes('services')) {
          // DigitalServicesFee (positive - credit back)
          refundDigitalServicesFee += Math.abs(feeAmount)
        } else if (feeType.includes('shipping') && feeAmount > 0) {
          // Refunded shipping (negative - cost)
          refundedShipping += feeAmount
        } else if (feeType.includes('commission') && feeAmount > 0) {
          // Refund commission (negative - cost)
          refundCommission += feeAmount
        }
      }

      // Unsellable products costs (negative - cost)
      // This is the cost of items that cannot be resold
      if (!ret.isSellable) {
        const orderItem = ret.order.items.find((item) => item.sku === ret.sku)
        if (orderItem) {
          // Calculate per-unit cost: totalPrice / quantity, then multiply by quantityReturned
          const unitCost = Number(orderItem.totalPrice) / orderItem.quantity
          unsellableProductsCosts += unitCost * ret.quantityReturned
        }
      }

      // Fee amount from return (negative - cost)
      refundedAmount += Number(ret.feeAmount)
    }

    // Refund cost = negative costs - positive credits
    // Negative costs: refundedAmount, refundedShipping, refundCommission, unsellableProductsCosts
    // Positive credits: valueOfReturnedItems, refundedReferralFee, refundPromotion, refundShipPromotion, refundFbaShippingChargeback, refundDigitalServicesFee
    const totalRefundCosts = refundedAmount + refundedShipping + refundCommission + unsellableProductsCosts
    const totalRefundCredits = valueOfReturnedItems + refundedReferralFee + refundPromotion + refundShipPromotion + 
                                refundFbaShippingChargeback + refundDigitalServicesFee
    const refundCost = totalRefundCosts - totalRefundCredits

    // Get sellable returns percentage
    const sellableReturns = returns.filter((ret) => ret.isSellable).length
    const sellableReturnsPercent = returns.length > 0 ? (sellableReturns / returns.length) * 100 : 0

    // Get all fees for Amazon fees breakdown
    const allFees = orderIds.length > 0 ? await prisma.fee.findMany({
      where: {
        orderId: { in: orderIds },
        ...(dateFilter ? { timestamp: dateFilter } : {}),
      },
    }) : []

    // Initialize fee breakdown categories
    let fbaPerUnitFulfillmentFee = 0
    let referralFee = 0
    let fbaStorageFee = 0
    let fbaRemovalFee = 0
    let vineFee = 0
    let vineEnrollmentFee = 0
    let couponRedemptionFee = 0
    let fbaDisposalFee = 0
    let subscriptionFee = 0
    let lightningDealFee = 0
    let digitalServicesFee = 0
    let couponPerformanceFeeRollup = 0
    let dealParticipationFeeRollup = 0
    let salesTaxCollectionFee = 0
    let couponParticipationFeeRollup = 0
    let couponPerformanceFee = 0
    let dealPerformanceFeeRollup = 0
    let couponParticipationFee = 0
    let compensatedClawback = 0
    let longTermStorageFee = 0
    let dealParticipationFee = 0
    let dealPerformanceFee = 0
    let microDeposit = 0
    let microDepositFailed = 0
    let warehouseDamage = 0 // Positive (reimbursement)
    let warehouseLost = 0 // Positive (reimbursement)
    let adjustmentFbaPerUnitFulfillmentFee = 0 // Positive (adjustment)
    let reversalReimbursement = 0 // Positive (reimbursement)

    // Categorize fees by feeType
    for (const fee of allFees) {
      const feeType = fee.feeType.toLowerCase()
      const feeAmount = Number(fee.amount)

      if (feeType.includes('fba') && (feeType.includes('per unit') || feeType.includes('fulfillment') || feeType.includes('fulfilment'))) {
        if (feeType.includes('adjustment')) {
          adjustmentFbaPerUnitFulfillmentFee += feeAmount
        } else {
          fbaPerUnitFulfillmentFee += feeAmount
        }
      } else if (feeType.includes('referral')) {
        referralFee += feeAmount
      } else if (feeType.includes('storage')) {
        if (feeType.includes('long term') || feeType.includes('long-term')) {
          longTermStorageFee += feeAmount
        } else {
          fbaStorageFee += feeAmount
        }
      } else if (feeType.includes('removal')) {
        fbaRemovalFee += feeAmount
      } else if (feeType.includes('vine')) {
        if (feeType.includes('enrollment')) {
          vineEnrollmentFee += feeAmount
        } else {
          vineFee += feeAmount
        }
      } else if (feeType.includes('coupon')) {
        if (feeType.includes('redemption')) {
          couponRedemptionFee += feeAmount
        } else if (feeType.includes('performance') && feeType.includes('rollup')) {
          couponPerformanceFeeRollup += feeAmount
        } else if (feeType.includes('performance')) {
          couponPerformanceFee += feeAmount
        } else if (feeType.includes('participation') && feeType.includes('rollup')) {
          couponParticipationFeeRollup += feeAmount
        } else if (feeType.includes('participation')) {
          couponParticipationFee += feeAmount
        }
      } else if (feeType.includes('disposal')) {
        fbaDisposalFee += feeAmount
      } else if (feeType.includes('subscription')) {
        subscriptionFee += feeAmount
      } else if (feeType.includes('lightning') && feeType.includes('deal')) {
        lightningDealFee += feeAmount
      } else if (feeType.includes('digital') || (feeType.includes('services') && !feeType.includes('digital'))) {
        digitalServicesFee += feeAmount
      } else if (feeType.includes('deal')) {
        if (feeType.includes('participation') && feeType.includes('rollup')) {
          dealParticipationFeeRollup += feeAmount
        } else if (feeType.includes('participation')) {
          dealParticipationFee += feeAmount
        } else if (feeType.includes('performance') && feeType.includes('rollup')) {
          dealPerformanceFeeRollup += feeAmount
        } else if (feeType.includes('performance')) {
          dealPerformanceFee += feeAmount
        }
      } else if (feeType.includes('sales tax') || feeType.includes('tax collection')) {
        salesTaxCollectionFee += feeAmount
      } else if (feeType.includes('compensated') && feeType.includes('clawback')) {
        compensatedClawback += feeAmount
      } else if (feeType.includes('micro') && feeType.includes('deposit')) {
        if (feeType.includes('failed')) {
          microDepositFailed += feeAmount
        } else {
          microDeposit += feeAmount
        }
      } else if (feeType.includes('warehouse')) {
        if (feeType.includes('damage')) {
          warehouseDamage += feeAmount
        } else if (feeType.includes('lost')) {
          warehouseLost += feeAmount
        }
      } else if (feeType.includes('reversal') && feeType.includes('reimbursement')) {
        reversalReimbursement += feeAmount
      }
    }

    // Calculate Cost of Goods breakdown
    // 1. Cost of goods sold - main COGS from sold items
    const costOfGoodsSold = summary.totalCOGS

    // 2. Disposal of sellable products - from FBA disposal fees (negative cost)
    // Note: FBA disposal fee is already captured in fbaDisposalFee, but we need to check if it's for sellable products
    // For now, we'll use FBA disposal fee as disposal cost
    const disposalOfSellableProducts = fbaDisposalFee

    // 3. Lost/damaged by Amazon - from warehouse damage/lost reimbursements (negative = cost)
    // Warehouse damage and lost are positive reimbursements, so we negate them to show as costs
    const lostDamagedByAmazon = -(warehouseDamage + warehouseLost)

    // 4. Missing returns - returns that don't have matching order items or are marked as missing
    // Calculate missing returns cost based on returns that can't be matched or are missing
    let missingReturnsCost = 0
    
    // Get all unique SKUs from returns that might be missing
    const missingReturnSkus = new Set<string>()
    for (const ret of returns) {
      const orderItem = ret.order.items.find((item) => item.sku === ret.sku)
      // If return doesn't have matching order item, or if reason code indicates missing
      if (!orderItem || ret.reasonCode?.toLowerCase().includes('missing')) {
        missingReturnSkus.add(ret.sku)
      }
    }
    
    // Get COGS for all missing return SKUs in one query
    if (missingReturnSkus.size > 0) {
      const cogsForMissingSkus = await prisma.cOGS.findMany({
        where: {
          accountId,
          sku: { in: Array.from(missingReturnSkus) },
          ...(dateFilter ? { purchaseDate: dateFilter } : {}),
        },
        orderBy: {
          purchaseDate: 'desc',
        },
      })
      
      // Group COGS by SKU, taking the most recent unit cost for each SKU
      const cogsBySku = new Map<string, number>()
      for (const cogs of cogsForMissingSkus) {
        if (!cogsBySku.has(cogs.sku)) {
          cogsBySku.set(cogs.sku, Number(cogs.unitCost))
        }
      }
      
      // Calculate missing returns cost
      for (const ret of returns) {
        const orderItem = ret.order.items.find((item) => item.sku === ret.sku)
        if (!orderItem || ret.reasonCode?.toLowerCase().includes('missing')) {
          const unitCost = cogsBySku.get(ret.sku) || 0
          if (unitCost > 0) {
            missingReturnsCost += unitCost * ret.quantityReturned
          }
        }
      }
    }

    // Get indirect expenses (expenses not allocated to specific products)
    const indirectExpenses = await prisma.expense.findMany({
      where: {
        accountId,
        ...(marketplaceId ? { marketplaceId } : {}),
        ...(dateFilter ? { incurredAt: dateFilter } : {}),
        category: { notIn: ['Advertising', 'Shipping', 'Giftwrap'] },
      },
    })
    const indirectExpensesTotal = indirectExpenses.reduce((sum, exp) => sum + Number(exp.amount), 0)

    // Calculate Real ACOS (Advertising Cost of Sales)
    const realACOS = summary.salesRevenue > 0 ? (totalAdvertisingCost / summary.salesRevenue) * 100 : 0

    // Calculate % Refunds
    const refundsPercent = summary.salesRevenue > 0 ? (summary.totalRefunds / summary.salesRevenue) * 100 : 0

    // Calculate ROI
    const roi = summary.totalCOGS > 0 ? ((summary.netProfit / summary.totalCOGS) * 100) : 0

    // Estimated payout (revenue - fees - refunds - expenses)
    const estimatedPayout = summary.salesRevenue - summary.totalFees - summary.totalRefunds - summary.totalExpenses

    // Sessions and unit session percentage
    // TODO: Get actual session data from analytics API when available
    // For now, estimate sessions based on orders (rough approximation)
    // In production, this should come from Amazon Analytics API or similar
    const estimatedSessions = orders.length * 50 // Rough estimate: 50 sessions per order
    const browserSessions = Math.round(estimatedSessions * 0.41) // ~41% browser based on typical distribution
    const mobileAppSessions = estimatedSessions - browserSessions
    const sessions = estimatedSessions
    
    const unitSessionPercentage = sessions > 0 ? (totalUnits / sessions) * 100 : 0

    periodDataMap.set(period.key, {
      sales: summary.salesRevenue,
      units: totalUnits,
      refunds: refundCount,
      promo: -promoAmount,
      advertisingCost: -totalAdvertisingCost,
      shippingCosts: -shippingCosts,
      giftwrap: giftwrap,
      refundCost: -refundCost,
      amazonFees: -summary.totalFees,
      costOfGoods: -summary.totalCOGS,
      grossProfit: summary.grossProfit,
      indirectExpenses: -indirectExpensesTotal,
      netProfit: summary.netProfit,
      estimatedPayout: estimatedPayout,
      realACOS: realACOS,
      refundsPercent: refundsPercent,
      sellableReturnsPercent: sellableReturnsPercent,
      margin: summary.netMargin,
      roi: roi,
      activeSubscriptions: 0, // TODO: Get from subscriptions if available
      sessions: sessions,
      unitSessionPercentage: unitSessionPercentage,
    })

    // Store child metrics data
    periodChildDataMap.set(period.key, {
      // Sales breakdown
      organicSales,
      sponsoredProductsSales,
      sponsoredDisplaySales,
      directSales: summary.salesRevenue, // Same as total sales
      subscriptionSales: 0, // TODO: Get from subscriptions if available
      // Units breakdown
      organicUnits,
      sponsoredProductsUnits,
      sponsoredDisplayUnits,
      directUnits: totalUnits, // Same as total units
      subscriptionUnits: 0, // TODO: Get from subscriptions if available
      // Advertising cost breakdown
      sponsoredProductsCost: -sponsoredProductsCost,
      sponsoredBrandsVideoCost: -sponsoredBrandsVideoCost,
      sponsoredBrandsCost: -sponsoredBrandsCost,
      sponsoredDisplayCost: -sponsoredDisplayCost,
      // Shipping costs breakdown
      fbaShippingChargeback: -fbaShippingChargeback,
      // Refund cost breakdown
      valueOfReturnedItems: valueOfReturnedItems, // Positive (credit)
      refundedReferralFee: refundedReferralFee, // Positive (credit)
      refundPromotion: refundPromotion, // Positive (credit)
      refundShipPromotion: refundShipPromotion, // Positive (credit)
      refundFbaShippingChargeback: refundFbaShippingChargeback, // Positive (credit)
      refundDigitalServicesFee: refundDigitalServicesFee, // Positive (credit)
      refundedShipping: -refundedShipping, // Negative (cost)
      refundCommission: -refundCommission, // Negative (cost)
      unsellableProductsCosts: -unsellableProductsCosts, // Negative (cost)
      refundedAmount: -refundedAmount, // Negative (cost)
      // Amazon fees breakdown
      fbaPerUnitFulfillmentFee: fbaPerUnitFulfillmentFee,
      referralFee: referralFee,
      fbaStorageFee: fbaStorageFee,
      fbaRemovalFee: fbaRemovalFee,
      vineFee: vineFee,
      vineEnrollmentFee: vineEnrollmentFee,
      couponRedemptionFee: couponRedemptionFee,
      fbaDisposalFee: fbaDisposalFee,
      subscriptionFee: subscriptionFee,
      lightningDealFee: lightningDealFee,
      digitalServicesFee: digitalServicesFee,
      couponPerformanceFeeRollup: couponPerformanceFeeRollup,
      dealParticipationFeeRollup: dealParticipationFeeRollup,
      salesTaxCollectionFee: salesTaxCollectionFee,
      couponParticipationFeeRollup: couponParticipationFeeRollup,
      couponPerformanceFee: couponPerformanceFee,
      dealPerformanceFeeRollup: dealPerformanceFeeRollup,
      couponParticipationFee: couponParticipationFee,
      compensatedClawback: compensatedClawback,
      longTermStorageFee: longTermStorageFee,
      dealParticipationFee: dealParticipationFee,
      dealPerformanceFee: dealPerformanceFee,
      microDeposit: microDeposit,
      microDepositFailed: microDepositFailed,
      warehouseDamage: warehouseDamage, // Positive (reimbursement)
      warehouseLost: warehouseLost, // Positive (reimbursement)
      adjustmentFbaPerUnitFulfillmentFee: adjustmentFbaPerUnitFulfillmentFee, // Positive (adjustment)
      reversalReimbursement: reversalReimbursement, // Positive (reimbursement)
      // Cost of goods breakdown
      costOfGoodsSold: -costOfGoodsSold, // Negative (cost)
      disposalOfSellableProducts: -disposalOfSellableProducts, // Negative (cost)
      lostDamagedByAmazon: lostDamagedByAmazon, // Negative (cost) - already negated
      missingReturns: -missingReturnsCost, // Negative (cost)
      // Sessions breakdown
      browserSessions: browserSessions,
      mobileAppSessions: mobileAppSessions,
    })
  }

  // Build metrics array
  const metrics: PLMetricRow[] = [
    {
      parameter: 'Sales',
      isExpandable: true,
      periods: periods.map((p) => ({
        period: p.key,
        value: periodDataMap.get(p.key)?.sales || 0,
      })),
      total: Array.from(periodDataMap.values()).reduce((sum, data) => sum + (data?.sales || 0), 0),
      children: [
        {
          parameter: 'Organic',
          isExpandable: false,
          periods: periods.map((p) => ({
            period: p.key,
            value: periodChildDataMap.get(p.key)?.organicSales || 0,
          })),
          total: Array.from(periodChildDataMap.values()).reduce((sum, data) => sum + (data?.organicSales || 0), 0),
        },
        {
          parameter: 'Sponsored Products (same day)',
          isExpandable: false,
          periods: periods.map((p) => ({
            period: p.key,
            value: periodChildDataMap.get(p.key)?.sponsoredProductsSales || 0,
          })),
          total: Array.from(periodChildDataMap.values()).reduce((sum, data) => sum + (data?.sponsoredProductsSales || 0), 0),
        },
        {
          parameter: 'Sponsored Display (same day)',
          isExpandable: false,
          periods: periods.map((p) => ({
            period: p.key,
            value: periodChildDataMap.get(p.key)?.sponsoredDisplaySales || 0,
          })),
          total: Array.from(periodChildDataMap.values()).reduce((sum, data) => sum + (data?.sponsoredDisplaySales || 0), 0),
        },
        {
          parameter: 'Direct sales',
          isExpandable: false,
          periods: periods.map((p) => ({
            period: p.key,
            value: periodChildDataMap.get(p.key)?.directSales || 0,
          })),
          total: Array.from(periodChildDataMap.values()).reduce((sum, data) => sum + (data?.directSales || 0), 0),
        },
        {
          parameter: 'Subscription sales (est.)',
          isExpandable: false,
          periods: periods.map((p) => ({
            period: p.key,
            value: periodChildDataMap.get(p.key)?.subscriptionSales || 0,
          })),
          total: Array.from(periodChildDataMap.values()).reduce((sum, data) => sum + (data?.subscriptionSales || 0), 0),
        },
      ],
    },
    {
      parameter: 'Units',
      isExpandable: true,
      periods: periods.map((p) => ({
        period: p.key,
        value: periodDataMap.get(p.key)?.units || 0,
      })),
      total: Array.from(periodDataMap.values()).reduce((sum, data) => sum + (data?.units || 0), 0),
      children: [
        {
          parameter: 'Organic',
          isExpandable: false,
          periods: periods.map((p) => ({
            period: p.key,
            value: periodChildDataMap.get(p.key)?.organicUnits || 0,
          })),
          total: Array.from(periodChildDataMap.values()).reduce((sum, data) => sum + (data?.organicUnits || 0), 0),
        },
        {
          parameter: 'Sponsored Products (same day)',
          isExpandable: false,
          periods: periods.map((p) => ({
            period: p.key,
            value: periodChildDataMap.get(p.key)?.sponsoredProductsUnits || 0,
          })),
          total: Array.from(periodChildDataMap.values()).reduce((sum, data) => sum + (data?.sponsoredProductsUnits || 0), 0),
        },
        {
          parameter: 'Sponsored Display (same day)',
          isExpandable: false,
          periods: periods.map((p) => ({
            period: p.key,
            value: periodChildDataMap.get(p.key)?.sponsoredDisplayUnits || 0,
          })),
          total: Array.from(periodChildDataMap.values()).reduce((sum, data) => sum + (data?.sponsoredDisplayUnits || 0), 0),
        },
        {
          parameter: 'Direct units',
          isExpandable: false,
          periods: periods.map((p) => ({
            period: p.key,
            value: periodChildDataMap.get(p.key)?.directUnits || 0,
          })),
          total: Array.from(periodChildDataMap.values()).reduce((sum, data) => sum + (data?.directUnits || 0), 0),
        },
        {
          parameter: 'Subscription units (est.)',
          isExpandable: false,
          periods: periods.map((p) => ({
            period: p.key,
            value: periodChildDataMap.get(p.key)?.subscriptionUnits || 0,
          })),
          total: Array.from(periodChildDataMap.values()).reduce((sum, data) => sum + (data?.subscriptionUnits || 0), 0),
        },
      ],
    },
    {
      parameter: 'Refunds',
      isExpandable: false,
      periods: periods.map((p) => ({
        period: p.key,
        value: periodDataMap.get(p.key)?.refunds || 0,
      })),
      total: Array.from(periodDataMap.values()).reduce((sum, data) => sum + (data?.refunds || 0), 0),
    },
    {
      parameter: 'Promo',
      isExpandable: false,
      periods: periods.map((p) => ({
        period: p.key,
        value: periodDataMap.get(p.key)?.promo || 0,
      })),
      total: Array.from(periodDataMap.values()).reduce((sum, data) => sum + (data?.promo || 0), 0),
    },
    {
      parameter: 'Advertising cost',
      isExpandable: true,
      periods: periods.map((p) => ({
        period: p.key,
        value: periodDataMap.get(p.key)?.advertisingCost || 0,
      })),
      total: Array.from(periodDataMap.values()).reduce((sum, data) => sum + (data?.advertisingCost || 0), 0),
      children: [
        {
          parameter: 'Sponsored Products',
          isExpandable: false,
          periods: periods.map((p) => ({
            period: p.key,
            value: periodChildDataMap.get(p.key)?.sponsoredProductsCost || 0,
          })),
          total: Array.from(periodChildDataMap.values()).reduce((sum, data) => sum + (data?.sponsoredProductsCost || 0), 0),
        },
        {
          parameter: 'Sponsored Brands Video',
          isExpandable: false,
          periods: periods.map((p) => ({
            period: p.key,
            value: periodChildDataMap.get(p.key)?.sponsoredBrandsVideoCost || 0,
          })),
          total: Array.from(periodChildDataMap.values()).reduce((sum, data) => sum + (data?.sponsoredBrandsVideoCost || 0), 0),
        },
        {
          parameter: 'Sponsored Brands',
          isExpandable: false,
          periods: periods.map((p) => ({
            period: p.key,
            value: periodChildDataMap.get(p.key)?.sponsoredBrandsCost || 0,
          })),
          total: Array.from(periodChildDataMap.values()).reduce((sum, data) => sum + (data?.sponsoredBrandsCost || 0), 0),
        },
        {
          parameter: 'Sponsored Display',
          isExpandable: false,
          periods: periods.map((p) => ({
            period: p.key,
            value: periodChildDataMap.get(p.key)?.sponsoredDisplayCost || 0,
          })),
          total: Array.from(periodChildDataMap.values()).reduce((sum, data) => sum + (data?.sponsoredDisplayCost || 0), 0),
        },
      ],
    },
    {
      parameter: 'Shipping costs',
      isExpandable: true,
      periods: periods.map((p) => ({
        period: p.key,
        value: periodDataMap.get(p.key)?.shippingCosts || 0,
      })),
      total: Array.from(periodDataMap.values()).reduce((sum, data) => sum + (data?.shippingCosts || 0), 0),
      children: [
        {
          parameter: 'FBA shipping chargeback',
          isExpandable: false,
          periods: periods.map((p) => ({
            period: p.key,
            value: periodChildDataMap.get(p.key)?.fbaShippingChargeback || 0,
          })),
          total: Array.from(periodChildDataMap.values()).reduce((sum, data) => sum + (data?.fbaShippingChargeback || 0), 0),
        },
      ],
    },
    {
      parameter: 'Giftwrap',
      isExpandable: false,
      periods: periods.map((p) => ({
        period: p.key,
        value: periodDataMap.get(p.key)?.giftwrap || 0,
      })),
      total: Array.from(periodDataMap.values()).reduce((sum, data) => sum + (data?.giftwrap || 0), 0),
    },
    {
      parameter: 'Refund cost',
      isExpandable: true,
      periods: periods.map((p) => ({
        period: p.key,
        value: periodDataMap.get(p.key)?.refundCost || 0,
      })),
      total: Array.from(periodDataMap.values()).reduce((sum, data) => sum + (data?.refundCost || 0), 0),
      children: [
        {
          parameter: 'Value of returned items',
          isExpandable: false,
          periods: periods.map((p) => ({
            period: p.key,
            value: periodChildDataMap.get(p.key)?.valueOfReturnedItems || 0,
          })),
          total: Array.from(periodChildDataMap.values()).reduce((sum, data) => sum + (data?.valueOfReturnedItems || 0), 0),
        },
        {
          parameter: 'Refunded referral fee',
          isExpandable: false,
          periods: periods.map((p) => ({
            period: p.key,
            value: periodChildDataMap.get(p.key)?.refundedReferralFee || 0,
          })),
          total: Array.from(periodChildDataMap.values()).reduce((sum, data) => sum + (data?.refundedReferralFee || 0), 0),
        },
        {
          parameter: 'Promotion',
          isExpandable: false,
          periods: periods.map((p) => ({
            period: p.key,
            value: periodChildDataMap.get(p.key)?.refundPromotion || 0,
          })),
          total: Array.from(periodChildDataMap.values()).reduce((sum, data) => sum + (data?.refundPromotion || 0), 0),
        },
        {
          parameter: 'Ship Promotion',
          isExpandable: false,
          periods: periods.map((p) => ({
            period: p.key,
            value: periodChildDataMap.get(p.key)?.refundShipPromotion || 0,
          })),
          total: Array.from(periodChildDataMap.values()).reduce((sum, data) => sum + (data?.refundShipPromotion || 0), 0),
        },
        {
          parameter: 'FBA shipping chargeback',
          isExpandable: false,
          periods: periods.map((p) => ({
            period: p.key,
            value: periodChildDataMap.get(p.key)?.refundFbaShippingChargeback || 0,
          })),
          total: Array.from(periodChildDataMap.values()).reduce((sum, data) => sum + (data?.refundFbaShippingChargeback || 0), 0),
        },
        {
          parameter: 'DigitalServicesFee',
          isExpandable: false,
          periods: periods.map((p) => ({
            period: p.key,
            value: periodChildDataMap.get(p.key)?.refundDigitalServicesFee || 0,
          })),
          total: Array.from(periodChildDataMap.values()).reduce((sum, data) => sum + (data?.refundDigitalServicesFee || 0), 0),
        },
        {
          parameter: 'Refunded shipping',
          isExpandable: false,
          periods: periods.map((p) => ({
            period: p.key,
            value: periodChildDataMap.get(p.key)?.refundedShipping || 0,
          })),
          total: Array.from(periodChildDataMap.values()).reduce((sum, data) => sum + (data?.refundedShipping || 0), 0),
        },
        {
          parameter: 'Refund commission',
          isExpandable: false,
          periods: periods.map((p) => ({
            period: p.key,
            value: periodChildDataMap.get(p.key)?.refundCommission || 0,
          })),
          total: Array.from(periodChildDataMap.values()).reduce((sum, data) => sum + (data?.refundCommission || 0), 0),
        },
        {
          parameter: 'Unsellable products costs',
          isExpandable: false,
          periods: periods.map((p) => ({
            period: p.key,
            value: periodChildDataMap.get(p.key)?.unsellableProductsCosts || 0,
          })),
          total: Array.from(periodChildDataMap.values()).reduce((sum, data) => sum + (data?.unsellableProductsCosts || 0), 0),
        },
        {
          parameter: 'Refunded amount',
          isExpandable: false,
          periods: periods.map((p) => ({
            period: p.key,
            value: periodChildDataMap.get(p.key)?.refundedAmount || 0,
          })),
          total: Array.from(periodChildDataMap.values()).reduce((sum, data) => sum + (data?.refundedAmount || 0), 0),
        },
      ],
    },
    {
      parameter: 'Amazon fees',
      isExpandable: true,
      periods: periods.map((p) => ({
        period: p.key,
        value: periodDataMap.get(p.key)?.amazonFees || 0,
      })),
      total: Array.from(periodDataMap.values()).reduce((sum, data) => sum + (data?.amazonFees || 0), 0),
      children: [
        {
          parameter: 'FBA per unit fulfilment fee',
          isExpandable: false,
          periods: periods.map((p) => ({
            period: p.key,
            value: periodChildDataMap.get(p.key)?.fbaPerUnitFulfillmentFee || 0,
          })),
          total: Array.from(periodChildDataMap.values()).reduce((sum, data) => sum + (data?.fbaPerUnitFulfillmentFee || 0), 0),
        },
        {
          parameter: 'Referral fee',
          isExpandable: false,
          periods: periods.map((p) => ({
            period: p.key,
            value: periodChildDataMap.get(p.key)?.referralFee || 0,
          })),
          total: Array.from(periodChildDataMap.values()).reduce((sum, data) => sum + (data?.referralFee || 0), 0),
        },
        {
          parameter: 'FBA storage fee',
          isExpandable: false,
          periods: periods.map((p) => ({
            period: p.key,
            value: periodChildDataMap.get(p.key)?.fbaStorageFee || 0,
          })),
          total: Array.from(periodChildDataMap.values()).reduce((sum, data) => sum + (data?.fbaStorageFee || 0), 0),
        },
        {
          parameter: 'FBA removal fee',
          isExpandable: false,
          periods: periods.map((p) => ({
            period: p.key,
            value: periodChildDataMap.get(p.key)?.fbaRemovalFee || 0,
          })),
          total: Array.from(periodChildDataMap.values()).reduce((sum, data) => sum + (data?.fbaRemovalFee || 0), 0),
        },
        {
          parameter: 'Vine fee',
          isExpandable: false,
          periods: periods.map((p) => ({
            period: p.key,
            value: periodChildDataMap.get(p.key)?.vineFee || 0,
          })),
          total: Array.from(periodChildDataMap.values()).reduce((sum, data) => sum + (data?.vineFee || 0), 0),
        },
        {
          parameter: 'Vine enrollment fee',
          isExpandable: false,
          periods: periods.map((p) => ({
            period: p.key,
            value: periodChildDataMap.get(p.key)?.vineEnrollmentFee || 0,
          })),
          total: Array.from(periodChildDataMap.values()).reduce((sum, data) => sum + (data?.vineEnrollmentFee || 0), 0),
        },
        {
          parameter: 'Coupon redemption fee',
          isExpandable: false,
          periods: periods.map((p) => ({
            period: p.key,
            value: periodChildDataMap.get(p.key)?.couponRedemptionFee || 0,
          })),
          total: Array.from(periodChildDataMap.values()).reduce((sum, data) => sum + (data?.couponRedemptionFee || 0), 0),
        },
        {
          parameter: 'FBA disposal fee',
          isExpandable: false,
          periods: periods.map((p) => ({
            period: p.key,
            value: periodChildDataMap.get(p.key)?.fbaDisposalFee || 0,
          })),
          total: Array.from(periodChildDataMap.values()).reduce((sum, data) => sum + (data?.fbaDisposalFee || 0), 0),
        },
        {
          parameter: 'Subscription',
          isExpandable: false,
          periods: periods.map((p) => ({
            period: p.key,
            value: periodChildDataMap.get(p.key)?.subscriptionFee || 0,
          })),
          total: Array.from(periodChildDataMap.values()).reduce((sum, data) => sum + (data?.subscriptionFee || 0), 0),
        },
        {
          parameter: 'Lightning deal fee',
          isExpandable: false,
          periods: periods.map((p) => ({
            period: p.key,
            value: periodChildDataMap.get(p.key)?.lightningDealFee || 0,
          })),
          total: Array.from(periodChildDataMap.values()).reduce((sum, data) => sum + (data?.lightningDealFee || 0), 0),
        },
        {
          parameter: 'Digital services fee',
          isExpandable: false,
          periods: periods.map((p) => ({
            period: p.key,
            value: periodChildDataMap.get(p.key)?.digitalServicesFee || 0,
          })),
          total: Array.from(periodChildDataMap.values()).reduce((sum, data) => sum + (data?.digitalServicesFee || 0), 0),
        },
        {
          parameter: 'Coupon performance fee rollup',
          isExpandable: false,
          periods: periods.map((p) => ({
            period: p.key,
            value: periodChildDataMap.get(p.key)?.couponPerformanceFeeRollup || 0,
          })),
          total: Array.from(periodChildDataMap.values()).reduce((sum, data) => sum + (data?.couponPerformanceFeeRollup || 0), 0),
        },
        {
          parameter: 'Deal participation fee rollup',
          isExpandable: false,
          periods: periods.map((p) => ({
            period: p.key,
            value: periodChildDataMap.get(p.key)?.dealParticipationFeeRollup || 0,
          })),
          total: Array.from(periodChildDataMap.values()).reduce((sum, data) => sum + (data?.dealParticipationFeeRollup || 0), 0),
        },
        {
          parameter: 'Sales tax collection fee',
          isExpandable: false,
          periods: periods.map((p) => ({
            period: p.key,
            value: periodChildDataMap.get(p.key)?.salesTaxCollectionFee || 0,
          })),
          total: Array.from(periodChildDataMap.values()).reduce((sum, data) => sum + (data?.salesTaxCollectionFee || 0), 0),
        },
        {
          parameter: 'Coupon participation fee rollup',
          isExpandable: false,
          periods: periods.map((p) => ({
            period: p.key,
            value: periodChildDataMap.get(p.key)?.couponParticipationFeeRollup || 0,
          })),
          total: Array.from(periodChildDataMap.values()).reduce((sum, data) => sum + (data?.couponParticipationFeeRollup || 0), 0),
        },
        {
          parameter: 'Coupon performance fee',
          isExpandable: false,
          periods: periods.map((p) => ({
            period: p.key,
            value: periodChildDataMap.get(p.key)?.couponPerformanceFee || 0,
          })),
          total: Array.from(periodChildDataMap.values()).reduce((sum, data) => sum + (data?.couponPerformanceFee || 0), 0),
        },
        {
          parameter: 'Deal performance fee rollup',
          isExpandable: false,
          periods: periods.map((p) => ({
            period: p.key,
            value: periodChildDataMap.get(p.key)?.dealPerformanceFeeRollup || 0,
          })),
          total: Array.from(periodChildDataMap.values()).reduce((sum, data) => sum + (data?.dealPerformanceFeeRollup || 0), 0),
        },
        {
          parameter: 'Coupon participation fee',
          isExpandable: false,
          periods: periods.map((p) => ({
            period: p.key,
            value: periodChildDataMap.get(p.key)?.couponParticipationFee || 0,
          })),
          total: Array.from(periodChildDataMap.values()).reduce((sum, data) => sum + (data?.couponParticipationFee || 0), 0),
        },
        {
          parameter: 'Compensated clawback',
          isExpandable: false,
          periods: periods.map((p) => ({
            period: p.key,
            value: periodChildDataMap.get(p.key)?.compensatedClawback || 0,
          })),
          total: Array.from(periodChildDataMap.values()).reduce((sum, data) => sum + (data?.compensatedClawback || 0), 0),
        },
        {
          parameter: 'Long term storage fee',
          isExpandable: false,
          periods: periods.map((p) => ({
            period: p.key,
            value: periodChildDataMap.get(p.key)?.longTermStorageFee || 0,
          })),
          total: Array.from(periodChildDataMap.values()).reduce((sum, data) => sum + (data?.longTermStorageFee || 0), 0),
        },
        {
          parameter: 'Deal participation fee',
          isExpandable: false,
          periods: periods.map((p) => ({
            period: p.key,
            value: periodChildDataMap.get(p.key)?.dealParticipationFee || 0,
          })),
          total: Array.from(periodChildDataMap.values()).reduce((sum, data) => sum + (data?.dealParticipationFee || 0), 0),
        },
        {
          parameter: 'Deal performance fee',
          isExpandable: false,
          periods: periods.map((p) => ({
            period: p.key,
            value: periodChildDataMap.get(p.key)?.dealPerformanceFee || 0,
          })),
          total: Array.from(periodChildDataMap.values()).reduce((sum, data) => sum + (data?.dealPerformanceFee || 0), 0),
        },
        {
          parameter: 'Micro Deposit',
          isExpandable: false,
          periods: periods.map((p) => ({
            period: p.key,
            value: periodChildDataMap.get(p.key)?.microDeposit || 0,
          })),
          total: Array.from(periodChildDataMap.values()).reduce((sum, data) => sum + (data?.microDeposit || 0), 0),
        },
        {
          parameter: 'Micro deposit (failed)',
          isExpandable: false,
          periods: periods.map((p) => ({
            period: p.key,
            value: periodChildDataMap.get(p.key)?.microDepositFailed || 0,
          })),
          total: Array.from(periodChildDataMap.values()).reduce((sum, data) => sum + (data?.microDepositFailed || 0), 0),
        },
        {
          parameter: 'Warehouse damage',
          isExpandable: false,
          periods: periods.map((p) => ({
            period: p.key,
            value: periodChildDataMap.get(p.key)?.warehouseDamage || 0,
          })),
          total: Array.from(periodChildDataMap.values()).reduce((sum, data) => sum + (data?.warehouseDamage || 0), 0),
        },
        {
          parameter: 'Warehouse lost',
          isExpandable: false,
          periods: periods.map((p) => ({
            period: p.key,
            value: periodChildDataMap.get(p.key)?.warehouseLost || 0,
          })),
          total: Array.from(periodChildDataMap.values()).reduce((sum, data) => sum + (data?.warehouseLost || 0), 0),
        },
        {
          parameter: 'Adjustment FBA per unit fulfillment fee',
          isExpandable: false,
          periods: periods.map((p) => ({
            period: p.key,
            value: periodChildDataMap.get(p.key)?.adjustmentFbaPerUnitFulfillmentFee || 0,
          })),
          total: Array.from(periodChildDataMap.values()).reduce((sum, data) => sum + (data?.adjustmentFbaPerUnitFulfillmentFee || 0), 0),
        },
        {
          parameter: 'Reversal reimbursement',
          isExpandable: false,
          periods: periods.map((p) => ({
            period: p.key,
            value: periodChildDataMap.get(p.key)?.reversalReimbursement || 0,
          })),
          total: Array.from(periodChildDataMap.values()).reduce((sum, data) => sum + (data?.reversalReimbursement || 0), 0),
        },
      ],
    },
    {
      parameter: 'Cost of goods',
      isExpandable: true,
      periods: periods.map((p) => ({
        period: p.key,
        value: periodDataMap.get(p.key)?.costOfGoods || 0,
      })),
      total: Array.from(periodDataMap.values()).reduce((sum, data) => sum + (data?.costOfGoods || 0), 0),
      children: [
        {
          parameter: 'Cost of goods sold',
          isExpandable: false,
          periods: periods.map((p) => ({
            period: p.key,
            value: periodChildDataMap.get(p.key)?.costOfGoodsSold || 0,
          })),
          total: Array.from(periodChildDataMap.values()).reduce((sum, data) => sum + (data?.costOfGoodsSold || 0), 0),
        },
        {
          parameter: 'Disposal of sellable products',
          isExpandable: false,
          periods: periods.map((p) => ({
            period: p.key,
            value: periodChildDataMap.get(p.key)?.disposalOfSellableProducts || 0,
          })),
          total: Array.from(periodChildDataMap.values()).reduce((sum, data) => sum + (data?.disposalOfSellableProducts || 0), 0),
        },
        {
          parameter: 'Lost/damaged by Amazon',
          isExpandable: false,
          periods: periods.map((p) => ({
            period: p.key,
            value: periodChildDataMap.get(p.key)?.lostDamagedByAmazon || 0,
          })),
          total: Array.from(periodChildDataMap.values()).reduce((sum, data) => sum + (data?.lostDamagedByAmazon || 0), 0),
        },
        {
          parameter: 'Missing returns',
          isExpandable: false,
          periods: periods.map((p) => ({
            period: p.key,
            value: periodChildDataMap.get(p.key)?.missingReturns || 0,
          })),
          total: Array.from(periodChildDataMap.values()).reduce((sum, data) => sum + (data?.missingReturns || 0), 0),
        },
      ],
    },
    {
      parameter: 'Gross profit',
      isExpandable: false,
      periods: periods.map((p) => ({
        period: p.key,
        value: periodDataMap.get(p.key)?.grossProfit || 0,
      })),
      total: Array.from(periodDataMap.values()).reduce((sum, data) => sum + (data?.grossProfit || 0), 0),
    },
    {
      parameter: 'Indirect expenses',
      isExpandable: false,
      periods: periods.map((p) => ({
        period: p.key,
        value: periodDataMap.get(p.key)?.indirectExpenses || 0,
      })),
      total: Array.from(periodDataMap.values()).reduce((sum, data) => sum + (data?.indirectExpenses || 0), 0),
    },
    {
      parameter: 'Net profit',
      isExpandable: false,
      periods: periods.map((p) => ({
        period: p.key,
        value: periodDataMap.get(p.key)?.netProfit || 0,
      })),
      total: Array.from(periodDataMap.values()).reduce((sum, data) => sum + (data?.netProfit || 0), 0),
    },
    {
      parameter: 'Estimated payout',
      isExpandable: false,
      periods: periods.map((p) => ({
        period: p.key,
        value: periodDataMap.get(p.key)?.estimatedPayout || 0,
      })),
      total: Array.from(periodDataMap.values()).reduce((sum, data) => sum + (data?.estimatedPayout || 0), 0),
    },
    {
      parameter: 'Real ACOS',
      isExpandable: false,
      periods: periods.map((p) => ({
        period: p.key,
        value: periodDataMap.get(p.key)?.realACOS || 0,
      })),
      total: 0, // ACOS is a percentage, not summable
    },
    {
      parameter: '% Refunds',
      isExpandable: false,
      periods: periods.map((p) => ({
        period: p.key,
        value: periodDataMap.get(p.key)?.refundsPercent || 0,
      })),
      total: 0, // Percentage, not summable
    },
    {
      parameter: 'Sellable returns',
      isExpandable: false,
      periods: periods.map((p) => ({
        period: p.key,
        value: periodDataMap.get(p.key)?.sellableReturnsPercent || 0,
      })),
      total: 0, // Percentage, not summable
    },
    {
      parameter: 'Margin',
      isExpandable: false,
      periods: periods.map((p) => ({
        period: p.key,
        value: periodDataMap.get(p.key)?.margin || 0,
      })),
      total: 0, // Percentage, not summable
    },
    {
      parameter: 'ROI',
      isExpandable: false,
      periods: periods.map((p) => ({
        period: p.key,
        value: periodDataMap.get(p.key)?.roi || 0,
      })),
      total: 0, // Percentage, not summable
    },
    {
      parameter: 'Active subscriptions (SnS)',
      isExpandable: false,
      periods: periods.map((p) => ({
        period: p.key,
        value: periodDataMap.get(p.key)?.activeSubscriptions || 0,
      })),
      total: Array.from(periodDataMap.values()).reduce((sum, data) => sum + (data?.activeSubscriptions || 0), 0),
    },
    {
      parameter: 'Sessions',
      isExpandable: true,
      periods: periods.map((p) => ({
        period: p.key,
        value: periodDataMap.get(p.key)?.sessions || 0,
      })),
      total: Array.from(periodDataMap.values()).reduce((sum, data) => sum + (data?.sessions || 0), 0),
      children: [
        {
          parameter: 'Browser sessions',
          isExpandable: false,
          periods: periods.map((p) => ({
            period: p.key,
            value: periodChildDataMap.get(p.key)?.browserSessions || 0,
          })),
          total: Array.from(periodChildDataMap.values()).reduce((sum, data) => sum + (data?.browserSessions || 0), 0),
        },
        {
          parameter: 'Mobile app sessions',
          isExpandable: false,
          periods: periods.map((p) => ({
            period: p.key,
            value: periodChildDataMap.get(p.key)?.mobileAppSessions || 0,
          })),
          total: Array.from(periodChildDataMap.values()).reduce((sum, data) => sum + (data?.mobileAppSessions || 0), 0),
        },
      ],
    },
    {
      parameter: 'Unit session percentage',
      isExpandable: false,
      periods: periods.map((p) => ({
        period: p.key,
        value: periodDataMap.get(p.key)?.unitSessionPercentage || 0,
      })),
      total: 0, // Percentage, not summable
    },
  ]

  return {
    periods: periods.map((p) => p.label),
    currentPeriod: periods[0].label,
    metrics,
    startDate: periods[periods.length - 1].startDate.toISOString(),
    endDate: periods[0].endDate.toISOString(),
  }
}
