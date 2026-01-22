import prisma from '../../../config/db'
import { AppError } from '../../../middlewares/error.middleware'
import {
  PPCProfitMetricsFilters,
  PPCProfitMetricsResponse,
  PPCProfitOverview,
} from './profitMetrics.types'

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

function calculateBreakEvenAcos(targetProfitability?: number | null): number {
  if (!targetProfitability || targetProfitability <= 0) {
    return 30
  }
  return Number(targetProfitability.toFixed(2))
}

function calculateEstimatedProfit(sales: number, spend: number, breakEvenAcos: number): number {
  const marginRate = breakEvenAcos / 100
  return Number((sales * marginRate - spend).toFixed(2))
}

function calculateSuggestedBid(
  currentBid: number,
  acos: number,
  targetAcos?: number | null
): number {
  if (!targetAcos || currentBid <= 0) {
    return Number(currentBid.toFixed(2))
  }
  const variance = (acos - targetAcos) / targetAcos
  if (Math.abs(variance) < 0.05) {
    return Number(currentBid.toFixed(2))
  }
  const adjustment = Math.min(Math.max(1 - variance, 0.7), 1.3)
  return Number((currentBid * adjustment).toFixed(2))
}

function calculateAcos(spend: number, sales: number): number {
  return sales > 0 ? Number(((spend / sales) * 100).toFixed(2)) : 0
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

export async function getProfitOverview(
  userId: string,
  filters: PPCProfitMetricsFilters
): Promise<PPCProfitOverview> {
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

  const breakEvenAcos = calculateBreakEvenAcos()
  const estimatedProfit = calculateEstimatedProfit(totalSales, totalSpend, breakEvenAcos)
  const suggestedBid = calculateSuggestedBid(1, calculateAcos(totalSpend, totalSales), breakEvenAcos)

  const trend = Array.from(trendMap.entries()).map(([date, value]) => ({
    date,
    spend: Number(value.spend.toFixed(2)),
    sales: Number(value.sales.toFixed(2)),
    breakEvenAcos,
    estimatedProfit: calculateEstimatedProfit(value.sales, value.spend, breakEvenAcos),
    suggestedBid,
  }))

  return {
    totalSpend: Number(totalSpend.toFixed(2)),
    totalSales: Number(totalSales.toFixed(2)),
    breakEvenAcos,
    estimatedProfit,
    suggestedBid,
    trend,
  }
}

export async function getCampaignProfit(
  userId: string,
  filters: PPCProfitMetricsFilters
): Promise<PPCProfitMetricsResponse> {
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

  const campaigns = await prisma.pPCCampaign.findMany({
    where: { accountId, marketplaceId: marketplaceId || undefined },
  })
  const map = new Map(campaigns.map((item) => [item.id, item]))

  const data = grouped.map((entry) => {
    const spend = Number(entry._sum.spend || 0)
    const sales = Number(entry._sum.sales || 0)
    const campaign = map.get(entry.campaignId)
    const breakEvenAcos = calculateBreakEvenAcos(campaign?.breakEvenAcos ? Number(campaign.breakEvenAcos) : undefined)
    const estimatedProfit = calculateEstimatedProfit(sales, spend, breakEvenAcos)
    const suggestedBid = calculateSuggestedBid(1, calculateAcos(spend, sales), breakEvenAcos)
    return {
      id: entry.campaignId,
      name: campaign?.campaignName || entry.campaignId,
      spend,
      sales,
      breakEvenAcos,
      estimatedProfit,
      suggestedBid,
    }
  })

  return { data, total: data.length }
}

export async function getAdGroupProfit(
  userId: string,
  filters: PPCProfitMetricsFilters
): Promise<PPCProfitMetricsResponse> {
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

  const adGroups = await prisma.pPCAdGroup.findMany({
    where: { accountId, marketplaceId: marketplaceId || undefined },
  })
  const map = new Map(adGroups.map((item) => [item.id, item]))

  const data = grouped
    .filter((entry) => entry.adGroupId)
    .map((entry) => {
      const spend = Number(entry._sum.spend || 0)
      const sales = Number(entry._sum.sales || 0)
      const adGroup = map.get(entry.adGroupId || '')
      const breakEvenAcos = calculateBreakEvenAcos(adGroup?.breakEvenAcos ? Number(adGroup.breakEvenAcos) : undefined)
      const estimatedProfit = calculateEstimatedProfit(sales, spend, breakEvenAcos)
      const suggestedBid = calculateSuggestedBid(1, calculateAcos(spend, sales), breakEvenAcos)
      return {
        id: entry.adGroupId || 'unknown',
        name: adGroup?.adGroupName || entry.adGroupId || 'Unknown',
        spend,
        sales,
        breakEvenAcos,
        estimatedProfit,
        suggestedBid,
      }
    })

  return { data, total: data.length }
}

export async function getKeywordProfit(
  userId: string,
  filters: PPCProfitMetricsFilters
): Promise<PPCProfitMetricsResponse> {
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

  const keywordTexts = grouped.map((entry) => entry.keywordId).filter(Boolean) as string[]
  const keywords = await prisma.pPCKeyword.findMany({
    where: {
      accountId,
      marketplaceId: marketplaceId || undefined,
      keyword: { in: keywordTexts },
    },
  })
  const map = new Map(keywords.map((item) => [item.keyword, item]))

  const data = grouped.map((entry) => {
    const spend = Number(entry._sum.spend || 0)
    const sales = Number(entry._sum.sales || 0)
    const keyword = map.get(entry.keywordId || '')
    const breakEvenAcos = calculateBreakEvenAcos(
      keyword?.breakEvenAcos ? Number(keyword.breakEvenAcos) : keyword?.targetProfitability
    )
    const estimatedProfit = calculateEstimatedProfit(sales, spend, breakEvenAcos)
    const suggestedBid = calculateSuggestedBid(Number(keyword?.currentBid || 1), calculateAcos(spend, sales), breakEvenAcos)
    return {
      id: keyword?.id || entry.keywordId || 'unknown',
      name: keyword?.keyword || entry.keywordId || 'Unknown',
      spend,
      sales,
      breakEvenAcos,
      estimatedProfit,
      suggestedBid,
    }
  })

  return { data, total: data.length }
}

