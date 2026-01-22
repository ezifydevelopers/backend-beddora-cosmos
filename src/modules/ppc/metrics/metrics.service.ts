import prisma from '../../../config/db'
import { AppError } from '../../../middlewares/error.middleware'
import {
  PPCMetricsFilters,
  PPCMetricsOverview,
  PPCMetricsResponse,
} from './metrics.types'

async function verifyAccountAccess(userId: string, accountId: string): Promise<void> {
  const userAccount = await prisma.userAccount.findFirst({
    where: { userId, accountId, isActive: true },
  })
  if (!userAccount) {
    throw new AppError('Account not found or access denied', 403)
  }
}

async function verifyAmazonAccountAccess(userId: string, amazonAccountId: string): Promise<void> {
  const amazonAccount = await prisma.amazonAccount.findFirst({
    where: { id: amazonAccountId, userId, isActive: true },
  })
  if (!amazonAccount) {
    throw new AppError('Amazon account not found or access denied', 403)
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

function calculateAcos(spend: number, sales: number): number {
  return sales > 0 ? Number(((spend / sales) * 100).toFixed(2)) : 0
}

function calculateRoi(spend: number, sales: number): number {
  return spend > 0 ? Number((((sales - spend) / spend) * 100).toFixed(2)) : 0
}

function getPeriodKey(date: Date, period: 'day' | 'week' | 'month'): string {
  if (period === 'week') {
    const weekStart = new Date(date)
    weekStart.setDate(date.getDate() - date.getDay() + 1)
    return weekStart.toISOString().split('T')[0]
  }
  if (period === 'month') {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
  }
  return date.toISOString().split('T')[0]
}

async function resolveAmazonAccounts(userId: string, accountId?: string, amazonAccountId?: string) {
  if (amazonAccountId) {
    await verifyAmazonAccountAccess(userId, amazonAccountId)
    return [amazonAccountId]
  }

  if (accountId) {
    await verifyAccountAccess(userId, accountId)
  }

  const accounts: Array<{ id: string }> = await prisma.amazonAccount.findMany({
    where: { userId, isActive: true },
    select: { id: true },
  })
  return accounts.map((item) => item.id)
}

export async function getPpcOverview(
  userId: string,
  filters: PPCMetricsFilters
): Promise<PPCMetricsOverview> {
  const { accountId, amazonAccountId, marketplaceId, sku, startDate, endDate, period = 'day' } =
    filters

  if (!accountId) {
    throw new AppError('accountId is required', 400)
  }

  await verifyAccountAccess(userId, accountId)

  const amazonAccountIds = await resolveAmazonAccounts(userId, accountId, amazonAccountId)
  const where: any = {
    amazonAccountId: { in: amazonAccountIds },
    marketplaceId: marketplaceId || undefined,
  }

  if (sku) {
    // SKU mapping depends on how PPC keyword IDs are stored in sync data.
    where.keywordId = sku
  }

  const dateFilter = buildDateFilter(startDate, endDate)
  if (dateFilter) where.date = dateFilter

  const metrics = await prisma.pPCMetric.findMany({
    where,
    orderBy: { date: 'asc' },
  })

  let totalSpend = 0
  let totalSales = 0
  const trendMap = new Map<string, { spend: number; sales: number }>()

  for (const metric of metrics) {
    totalSpend += Number(metric.spend)
    totalSales += Number(metric.sales)
    const key = getPeriodKey(metric.date, period)
    if (!trendMap.has(key)) {
      trendMap.set(key, { spend: 0, sales: 0 })
    }
    const entry = trendMap.get(key)!
    entry.spend += Number(metric.spend)
    entry.sales += Number(metric.sales)
  }

  const trend = Array.from(trendMap.entries()).map(([date, value]) => ({
    date,
    spend: Number(value.spend.toFixed(2)),
    sales: Number(value.sales.toFixed(2)),
    acos: calculateAcos(value.spend, value.sales),
    roi: calculateRoi(value.spend, value.sales),
  }))

  return {
    totalSpend: Number(totalSpend.toFixed(2)),
    totalSales: Number(totalSales.toFixed(2)),
    acos: calculateAcos(totalSpend, totalSales),
    roi: calculateRoi(totalSpend, totalSales),
    trend,
  }
}

export async function getCampaignMetrics(
  userId: string,
  filters: PPCMetricsFilters
): Promise<PPCMetricsResponse> {
  const { accountId, amazonAccountId, marketplaceId, sku, startDate, endDate } = filters
  if (!accountId) {
    throw new AppError('accountId is required', 400)
  }

  await verifyAccountAccess(userId, accountId)
  const amazonAccountIds = await resolveAmazonAccounts(userId, accountId, amazonAccountId)

  const where: any = {
    amazonAccountId: { in: amazonAccountIds },
    marketplaceId: marketplaceId || undefined,
  }

  if (sku) {
    where.keywordId = sku
  }

  const dateFilter = buildDateFilter(startDate, endDate)
  if (dateFilter) where.date = dateFilter

  const grouped = await prisma.pPCMetric.groupBy({
    by: ['campaignId'],
    where,
    _sum: { spend: true, sales: true },
  })

  return {
    data: grouped.map((entry) => {
      const spend = Number(entry._sum.spend || 0)
      const sales = Number(entry._sum.sales || 0)
      return {
        id: entry.campaignId,
        name: entry.campaignId,
        spend,
        sales,
        acos: calculateAcos(spend, sales),
        roi: calculateRoi(spend, sales),
      }
    }),
    total: grouped.length,
  }
}

export async function getAdGroupMetrics(
  userId: string,
  filters: PPCMetricsFilters
): Promise<PPCMetricsResponse> {
  const { accountId, amazonAccountId, marketplaceId, sku, startDate, endDate } = filters
  if (!accountId) {
    throw new AppError('accountId is required', 400)
  }

  await verifyAccountAccess(userId, accountId)
  const amazonAccountIds = await resolveAmazonAccounts(userId, accountId, amazonAccountId)

  const where: any = {
    amazonAccountId: { in: amazonAccountIds },
    marketplaceId: marketplaceId || undefined,
  }

  if (sku) {
    where.keywordId = sku
  }

  const dateFilter = buildDateFilter(startDate, endDate)
  if (dateFilter) where.date = dateFilter

  const grouped = await prisma.pPCMetric.groupBy({
    by: ['adGroupId'],
    where,
    _sum: { spend: true, sales: true },
  })

  const filtered = grouped.filter((entry) => entry.adGroupId)

  return {
    data: filtered.map((entry) => {
      const spend = Number(entry._sum.spend || 0)
      const sales = Number(entry._sum.sales || 0)
      return {
        id: entry.adGroupId || 'unknown',
        name: entry.adGroupId || 'Unknown',
        spend,
        sales,
        acos: calculateAcos(spend, sales),
        roi: calculateRoi(spend, sales),
      }
    }),
    total: filtered.length,
  }
}

export async function getKeywordMetrics(
  userId: string,
  filters: PPCMetricsFilters
): Promise<PPCMetricsResponse> {
  const { accountId, amazonAccountId, marketplaceId, sku, startDate, endDate } = filters
  if (!accountId) {
    throw new AppError('accountId is required', 400)
  }

  await verifyAccountAccess(userId, accountId)
  const amazonAccountIds = await resolveAmazonAccounts(userId, accountId, amazonAccountId)

  const where: any = {
    amazonAccountId: { in: amazonAccountIds },
    marketplaceId: marketplaceId || undefined,
  }

  if (sku) {
    where.keywordId = sku
  }

  const dateFilter = buildDateFilter(startDate, endDate)
  if (dateFilter) where.date = dateFilter

  const grouped = await prisma.pPCMetric.groupBy({
    by: ['keywordId'],
    where,
    _sum: { spend: true, sales: true },
  })

  const filtered = grouped.filter((entry) => entry.keywordId)

  return {
    data: filtered.map((entry) => {
      const spend = Number(entry._sum.spend || 0)
      const sales = Number(entry._sum.sales || 0)
      return {
        id: entry.keywordId || 'unknown',
        name: entry.keywordId || 'Unknown',
        spend,
        sales,
        acos: calculateAcos(spend, sales),
        roi: calculateRoi(spend, sales),
      }
    }),
    total: filtered.length,
  }
}

