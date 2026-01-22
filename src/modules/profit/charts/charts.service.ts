import prisma from '../../../config/db'
import { AppError } from '../../../middlewares/error.middleware'
import { getProfitTrends } from '../profit.service'
import {
  ChartFilters,
  ChartPeriod,
  ChartResponse,
  ComparisonResponse,
  ChartMetric,
  ChartSeries,
  DashboardChartResponse,
} from '../../../types/charts.types'

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

function buildDateFilter(startDate?: string, endDate?: string) {
  const filter: { gte?: Date; lte?: Date } = {}
  if (startDate) filter.gte = new Date(startDate)
  if (endDate) {
    const end = new Date(endDate)
    end.setHours(23, 59, 59, 999)
    filter.lte = end
  }
  return Object.keys(filter).length > 0 ? filter : undefined
}

function formatPeriodKey(date: Date, period: ChartPeriod): string {
  switch (period) {
    case 'week': {
      const weekStart = new Date(date)
      weekStart.setDate(date.getDate() - date.getDay() + 1)
      return weekStart.toISOString().split('T')[0]
    }
    case 'month':
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    case 'quarter': {
      const quarter = Math.floor(date.getMonth() / 3) + 1
      return `${date.getFullYear()}-Q${quarter}`
    }
    case 'year':
      return `${date.getFullYear()}`
    case 'day':
    default:
      return date.toISOString().split('T')[0]
  }
}

function resolveDateRange(startDate?: string, endDate?: string) {
  const end = endDate ? new Date(endDate) : new Date()
  const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  return { start, end }
}

export async function getProfitChart(filters: ChartFilters, userId: string): Promise<ChartResponse> {
  const { accountId, amazonAccountId, marketplaceId, sku, startDate, endDate, period = 'day' } = filters

  if (!accountId) {
    throw new AppError('accountId is required', 400)
  }

  await verifyAccountAccess(userId, accountId)

  const trends = await getProfitTrends(
    {
      accountId,
      amazonAccountId,
      marketplaceId,
      sku,
      startDate,
      endDate,
      period,
    },
    userId
  )

  return {
    metric: 'profit',
    period,
    startDate: trends.startDate,
    endDate: trends.endDate,
    series: [
      {
        label: 'Net Profit',
        data: trends.data.map((item) => ({ period: item.date, value: item.netProfit })),
      },
      {
        label: 'Sales Revenue',
        data: trends.data.map((item) => ({ period: item.date, value: item.salesRevenue })),
      },
    ],
  }
}

export async function getSalesChart(filters: ChartFilters, userId: string): Promise<ChartResponse> {
  const { accountId, marketplaceId, sku, startDate, endDate, period = 'day' } = filters

  if (!accountId) {
    throw new AppError('accountId is required', 400)
  }

  await verifyAccountAccess(userId, accountId)

  const { start, end } = resolveDateRange(startDate, endDate)
  const dateFilter = buildDateFilter(startDate, endDate)

  const points = new Map<string, number>()

  if (sku) {
    const orderItems = await prisma.orderItem.findMany({
      where: {
        sku,
        order: {
          accountId,
          ...(marketplaceId ? { marketplaceId } : {}),
          ...(dateFilter ? { orderDate: dateFilter } : {}),
        },
      },
      include: {
        order: {
          select: {
            orderDate: true,
          },
        },
      },
    })

    for (const item of orderItems) {
      const key = formatPeriodKey(item.order.orderDate, period)
      points.set(key, (points.get(key) || 0) + Number(item.totalPrice))
    }
  } else {
    const orders = await prisma.order.findMany({
      where: {
        accountId,
        ...(marketplaceId ? { marketplaceId } : {}),
        ...(dateFilter ? { orderDate: dateFilter } : {}),
      },
      select: {
        orderDate: true,
        totalAmount: true,
      },
    })

    for (const order of orders) {
      const key = formatPeriodKey(order.orderDate, period)
      points.set(key, (points.get(key) || 0) + Number(order.totalAmount))
    }
  }

  const data = Array.from(points.entries())
    .map(([periodKey, value]) => ({ period: periodKey, value: Number(value.toFixed(2)) }))
    .sort((a, b) => a.period.localeCompare(b.period))

  return {
    metric: 'sales',
    period,
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    series: [{ label: 'Sales Revenue', data }],
  }
}

export async function getPpcChart(filters: ChartFilters, userId: string): Promise<ChartResponse> {
  const { accountId, amazonAccountId, marketplaceId, campaignId, startDate, endDate, period = 'day' } = filters

  if (!amazonAccountId && !accountId) {
    throw new AppError('amazonAccountId or accountId is required', 400)
  }

  if (accountId) {
    await verifyAccountAccess(userId, accountId)
  }

  const { start, end } = resolveDateRange(startDate, endDate)
  const dateFilter = buildDateFilter(startDate, endDate)

  const metrics = await prisma.pPCMetric.findMany({
    where: {
      ...(amazonAccountId ? { amazonAccountId } : {}),
      ...(marketplaceId ? { marketplaceId } : {}),
      ...(campaignId ? { campaignId } : {}),
      ...(dateFilter ? { date: dateFilter } : {}),
    },
    select: {
      date: true,
      spend: true,
    },
  })

  const points = new Map<string, number>()
  for (const metric of metrics) {
    const key = formatPeriodKey(metric.date, period)
    points.set(key, (points.get(key) || 0) + Number(metric.spend))
  }

  const data = Array.from(points.entries())
    .map(([periodKey, value]) => ({ period: periodKey, value: Number(value.toFixed(2)) }))
    .sort((a, b) => a.period.localeCompare(b.period))

  return {
    metric: 'ppc',
    period,
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    series: [{ label: 'PPC Spend', data }],
  }
}

export async function getReturnsChart(filters: ChartFilters, userId: string): Promise<ChartResponse> {
  const { accountId, marketplaceId, sku, startDate, endDate, period = 'day' } = filters

  if (!accountId) {
    throw new AppError('accountId is required', 400)
  }

  await verifyAccountAccess(userId, accountId)

  const { start, end } = resolveDateRange(startDate, endDate)
  const dateFilter = buildDateFilter(startDate, endDate)

  const returns = await prisma.return.findMany({
    where: {
      accountId,
      ...(marketplaceId ? { marketplaceId } : {}),
      ...(sku ? { sku } : {}),
      ...(dateFilter ? { createdAt: dateFilter } : {}),
    },
    select: {
      createdAt: true,
      refundAmount: true,
      feeAmount: true,
    },
  })

  const points = new Map<string, number>()
  for (const entry of returns) {
    const key = formatPeriodKey(entry.createdAt, period)
    points.set(
      key,
      (points.get(key) || 0) + Number(entry.refundAmount) + Number(entry.feeAmount)
    )
  }

  const data = Array.from(points.entries())
    .map(([periodKey, value]) => ({ period: periodKey, value: Number(value.toFixed(2)) }))
    .sort((a, b) => a.period.localeCompare(b.period))

  return {
    metric: 'returns',
    period,
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    series: [{ label: 'Returns Cost', data }],
  }
}

function shiftRange(start: Date, end: Date): { prevStart: Date; prevEnd: Date } {
  const diff = end.getTime() - start.getTime()
  const prevEnd = new Date(start.getTime() - 1)
  const prevStart = new Date(prevEnd.getTime() - diff)
  return { prevStart, prevEnd }
}

export async function getComparisonChart(
  filters: ChartFilters & { metric?: ChartMetric },
  userId: string
): Promise<ComparisonResponse> {
  const { metric = 'profit', startDate, endDate, period = 'day' } = filters
  const { start, end } = resolveDateRange(startDate, endDate)
  const { prevStart, prevEnd } = shiftRange(start, end)

  const commonFilters: ChartFilters = {
    ...filters,
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    period,
  }

  const previousFilters: ChartFilters = {
    ...filters,
    startDate: prevStart.toISOString(),
    endDate: prevEnd.toISOString(),
    period,
  }

  const getMetric = async (targetFilters: ChartFilters): Promise<ChartSeries> => {
    switch (metric) {
      case 'sales': {
        const chart = await getSalesChart(targetFilters, userId)
        return chart.series[0]
      }
      case 'ppc': {
        const chart = await getPpcChart(targetFilters, userId)
        return chart.series[0]
      }
      case 'returns': {
        const chart = await getReturnsChart(targetFilters, userId)
        return chart.series[0]
      }
      case 'profit':
      default: {
        const chart = await getProfitChart(targetFilters, userId)
        return chart.series[0]
      }
    }
  }

  const currentSeries = await getMetric(commonFilters)
  const previousSeries = await getMetric(previousFilters)

  return {
    metric,
    period,
    current: { ...currentSeries, label: 'Current Period' },
    previous: { ...previousSeries, label: 'Previous Period' },
    currentRange: {
      startDate: commonFilters.startDate!,
      endDate: commonFilters.endDate!,
    },
    previousRange: {
      startDate: previousFilters.startDate!,
      endDate: previousFilters.endDate!,
    },
  }
}

/**
 * Get dashboard chart data
 * Returns multiple metrics for combination chart (units sold, advertising cost, refunds, net profit)
 */
export async function getDashboardChart(
  filters: ChartFilters,
  userId: string
): Promise<DashboardChartResponse> {
  const { accountId, marketplaceId, startDate, endDate, period = 'month' } = filters

  if (!accountId) {
    throw new AppError('accountId is required', 400)
  }

  await verifyAccountAccess(userId, accountId)

  const { start, end } = resolveDateRange(startDate, endDate)
  const dateFilter = buildDateFilter(startDate, endDate)

  // Get orders for units sold and net profit calculation
  const orders = await prisma.order.findMany({
    where: {
      accountId,
      ...(marketplaceId ? { marketplaceId } : {}),
      ...(dateFilter ? { orderDate: dateFilter } : {}),
    },
    include: {
      items: true,
      fees: true,
      refunds: true,
    },
  })

  // Get expenses for advertising cost
  const expenses = await prisma.expense.findMany({
    where: {
      accountId,
      ...(marketplaceId ? { marketplaceId } : {}),
      ...(dateFilter ? { incurredAt: dateFilter } : {}),
      category: 'Advertising',
    },
  })

  // Get COGS for net profit calculation
  const cogsRecords = await prisma.cOGS.findMany({
    where: {
      accountId,
      ...(marketplaceId ? { marketplaceId } : {}),
      ...(dateFilter ? { purchaseDate: dateFilter } : {}),
    },
  })

  // Group by period
  const periodMap = new Map<
    string,
    {
      unitsSold: number
      advertisingCost: number
      refunds: number
      netProfit: number
    }
  >()

  // Process orders
  for (const order of orders) {
    const periodKey = formatPeriodKey(order.orderDate, period)

    if (!periodMap.has(periodKey)) {
      periodMap.set(periodKey, {
        unitsSold: 0,
        advertisingCost: 0,
        refunds: 0,
        netProfit: 0,
      })
    }

    const periodData = periodMap.get(periodKey)!

    // Calculate units sold
    const orderUnits = order.items.reduce((sum, item) => sum + item.quantity, 0)
    periodData.unitsSold += orderUnits

    // Calculate refunds
    const orderRefunds = order.refunds.reduce((sum, refund) => sum + Number(refund.amount), 0)
    periodData.refunds += orderRefunds

    // Calculate net profit (revenue - fees - refunds - COGS)
    const orderRevenue = Number(order.totalAmount)
    const orderFees = order.fees.reduce((sum, fee) => sum + Number(fee.amount), 0)
    
    // Estimate COGS for this order (simplified - using average COGS per unit)
    const orderCogs = order.items.reduce((sum, item) => {
      const avgCogs = cogsRecords
        .filter(c => c.sku === item.sku)
        .reduce((total, c) => total + Number(c.totalCost), 0) / 
        Math.max(cogsRecords.filter(c => c.sku === item.sku).reduce((total, c) => total + c.quantity, 0), 1)
      return sum + (avgCogs * item.quantity)
    }, 0)

    const orderNetProfit = orderRevenue - orderFees - orderRefunds - orderCogs
    periodData.netProfit += orderNetProfit
  }

  // Process advertising expenses
  for (const expense of expenses) {
    const periodKey = formatPeriodKey(expense.incurredAt, period)
    const periodData = periodMap.get(periodKey)
    if (periodData) {
      periodData.advertisingCost += Number(expense.amount)
    }
  }

  // Convert to array and sort
  const data = Array.from(periodMap.entries())
    .map(([periodKey, values]) => ({
      period: periodKey,
      unitsSold: Math.round(values.unitsSold),
      advertisingCost: Number(values.advertisingCost.toFixed(2)),
      refunds: Number(values.refunds.toFixed(2)),
      netProfit: Number(values.netProfit.toFixed(2)),
    }))
    .sort((a, b) => a.period.localeCompare(b.period))

  return {
    period,
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    data,
  }
}
