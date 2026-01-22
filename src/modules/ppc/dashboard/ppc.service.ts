import prisma from '../../../config/db'
import { AppError } from '../../../middlewares/error.middleware'
import {
  PPCAdGroupItem,
  PPCCampaignItem,
  PPCDashboardFilters,
  PPCKeywordItem,
  PPCListResponse,
  PPCOverview,
} from '../../../types/ppc-dashboard.types'

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
  return accounts.map((item: { id: string }) => item.id)
}

export async function getPPCOverview(
  userId: string,
  filters: PPCDashboardFilters
): Promise<PPCOverview> {
  const { accountId, amazonAccountId, marketplaceId, startDate, endDate, period = 'day' } = filters

  if (!accountId) {
    throw new AppError('accountId is required', 400)
  }

  await verifyAccountAccess(userId, accountId)

  const amazonAccountIds = await resolveAmazonAccounts(userId, accountId, amazonAccountId)

  const where: any = {
    amazonAccountId: { in: amazonAccountIds },
    marketplaceId: marketplaceId || undefined,
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

export async function getCampaigns(
  userId: string,
  filters: PPCDashboardFilters
): Promise<PPCListResponse<PPCCampaignItem>> {
  const { accountId, amazonAccountId, marketplaceId, startDate, endDate } = filters

  if (!accountId) {
    throw new AppError('accountId is required', 400)
  }

  await verifyAccountAccess(userId, accountId)

  const amazonAccountIds = await resolveAmazonAccounts(userId, accountId, amazonAccountId)
  const where: any = {
    amazonAccountId: { in: amazonAccountIds },
    marketplaceId: marketplaceId || undefined,
  }
  const dateFilter = buildDateFilter(startDate, endDate)
  if (dateFilter) where.date = dateFilter

  const grouped: Array<{ campaignId: string; _sum: { spend: any; sales: any } }> =
    await prisma.pPCMetric.groupBy({
    by: ['campaignId'],
    where,
    _sum: {
      spend: true,
      sales: true,
    },
  })

  const campaignIds = grouped.map((entry: { campaignId: string }) => entry.campaignId)
  const campaigns = await prisma.pPC_Campaign.findMany({
    where: { campaignId: { in: campaignIds } },
  })

  const campaignMap = new Map<string, (typeof campaigns)[number]>()
  for (const campaign of campaigns) {
    campaignMap.set(campaign.campaignId, campaign)
  }

  const items: PPCCampaignItem[] = []

  for (const entry of grouped) {
    const spend = Number(entry._sum.spend || 0)
    const sales = Number(entry._sum.sales || 0)
    const campaign = campaignMap.get(entry.campaignId)
    const campaignName = campaign?.name || entry.campaignId
    const status = campaign?.status || 'active'

    const existing = await prisma.pPCCampaign.findFirst({
      where: {
        accountId,
        marketplaceId: marketplaceId || null,
        campaignName,
      },
    })

    const record = existing
      ? await prisma.pPCCampaign.update({
          where: { id: existing.id },
          data: {
            totalSpend: spend,
            totalSales: sales,
            acos: calculateAcos(spend, sales),
            roi: calculateRoi(spend, sales),
            status,
          },
        })
      : await prisma.pPCCampaign.create({
          data: {
            accountId,
            marketplaceId: marketplaceId || null,
            campaignName,
            status,
            totalSpend: spend,
            totalSales: sales,
            acos: calculateAcos(spend, sales),
            roi: calculateRoi(spend, sales),
          },
        })

    items.push({
      id: record.id,
      campaignName: record.campaignName,
      status: record.status,
      totalSpend: Number(record.totalSpend),
      totalSales: Number(record.totalSales),
      acos: Number(record.acos),
      roi: Number(record.roi),
    })
  }

  return { data: items, total: items.length }
}

export async function getAdGroups(
  userId: string,
  filters: PPCDashboardFilters
): Promise<PPCListResponse<PPCAdGroupItem>> {
  const { accountId, amazonAccountId, marketplaceId, startDate, endDate } = filters
  if (!accountId) {
    throw new AppError('accountId is required', 400)
  }
  await verifyAccountAccess(userId, accountId)
  const amazonAccountIds = await resolveAmazonAccounts(userId, accountId, amazonAccountId)

  const where: any = {
    amazonAccountId: { in: amazonAccountIds },
    marketplaceId: marketplaceId || undefined,
  }
  const dateFilter = buildDateFilter(startDate, endDate)
  if (dateFilter) where.date = dateFilter

  const grouped = await prisma.pPCMetric.groupBy({
    by: ['campaignId', 'adGroupId'],
    where,
    _sum: { spend: true, sales: true },
  })

  const items: PPCAdGroupItem[] = []

  for (const entry of grouped) {
    if (!entry.adGroupId) continue
    const spend = Number(entry._sum.spend || 0)
    const sales = Number(entry._sum.sales || 0)
    const campaignName = entry.campaignId

    const campaign =
      (await prisma.pPCCampaign.findFirst({
        where: { accountId, marketplaceId: marketplaceId || null, campaignName },
      })) ||
      (await prisma.pPCCampaign.create({
        data: {
          accountId,
          marketplaceId: marketplaceId || null,
          campaignName,
          status: 'active',
        },
      }))

    const existing = await prisma.pPCAdGroup.findFirst({
      where: {
        accountId,
        marketplaceId: marketplaceId || null,
        adGroupName: entry.adGroupId,
        campaignId: campaign.id,
      },
    })

    const record = existing
      ? await prisma.pPCAdGroup.update({
          where: { id: existing.id },
          data: {
            campaignId: campaign.id,
            spend,
            sales,
            acos: calculateAcos(spend, sales),
            roi: calculateRoi(spend, sales),
          },
        })
      : await prisma.pPCAdGroup.create({
          data: {
            campaignId: campaign.id,
            accountId,
            marketplaceId: marketplaceId || null,
            adGroupName: entry.adGroupId,
            spend,
            sales,
            acos: calculateAcos(spend, sales),
            roi: calculateRoi(spend, sales),
          },
        })

    items.push({
      id: record.id,
      campaignId: record.campaignId,
      adGroupName: record.adGroupName,
      spend: Number(record.spend),
      sales: Number(record.sales),
      acos: Number(record.acos),
      roi: Number(record.roi),
    })
  }

  return { data: items, total: items.length }
}

export async function getKeywords(
  userId: string,
  filters: PPCDashboardFilters
): Promise<PPCListResponse<PPCKeywordItem>> {
  const { accountId, amazonAccountId, marketplaceId, startDate, endDate } = filters
  if (!accountId) {
    throw new AppError('accountId is required', 400)
  }
  await verifyAccountAccess(userId, accountId)
  const amazonAccountIds = await resolveAmazonAccounts(userId, accountId, amazonAccountId)

  const where: any = {
    amazonAccountId: { in: amazonAccountIds },
    marketplaceId: marketplaceId || undefined,
  }
  const dateFilter = buildDateFilter(startDate, endDate)
  if (dateFilter) where.date = dateFilter

  const grouped = await prisma.pPCMetric.groupBy({
    by: ['campaignId', 'adGroupId', 'keywordId'],
    where,
    _sum: { spend: true, sales: true },
  })

  const items: PPCKeywordItem[] = []

  for (const entry of grouped) {
    if (!entry.adGroupId || !entry.keywordId || !entry.campaignId) continue
    const spend = Number(entry._sum.spend || 0)
    const sales = Number(entry._sum.sales || 0)

    const campaign =
      (await prisma.pPCCampaign.findFirst({
        where: { accountId, marketplaceId: marketplaceId || null, campaignName: entry.campaignId },
      })) ||
      (await prisma.pPCCampaign.create({
        data: {
          accountId,
          marketplaceId: marketplaceId || null,
          campaignName: entry.campaignId,
          status: 'active',
        },
      }))

    const adGroup =
      (await prisma.pPCAdGroup.findFirst({
        where: {
          accountId,
          marketplaceId: marketplaceId || null,
          adGroupName: entry.adGroupId,
          campaignId: campaign.id,
        },
      })) ||
      (await prisma.pPCAdGroup.create({
        data: {
          campaignId: campaign.id,
          accountId,
          marketplaceId: marketplaceId || null,
          adGroupName: entry.adGroupId,
          spend: 0,
          sales: 0,
        },
      }))

    const existing = await prisma.pPCKeyword.findFirst({
      where: {
        accountId,
        marketplaceId: marketplaceId || null,
        keyword: entry.keywordId,
        adGroupId: adGroup.id,
      },
    })

    const record = existing
      ? await prisma.pPCKeyword.update({
          where: { id: existing.id },
          data: {
            adGroupId: adGroup.id,
            spend,
            sales,
            acos: calculateAcos(spend, sales),
            roi: calculateRoi(spend, sales),
          },
        })
      : await prisma.pPCKeyword.create({
          data: {
            adGroupId: adGroup.id,
            accountId,
            marketplaceId: marketplaceId || null,
            keyword: entry.keywordId,
            matchType: null,
            spend,
            sales,
            acos: calculateAcos(spend, sales),
            roi: calculateRoi(spend, sales),
          },
        })

    items.push({
      id: record.id,
      adGroupId: record.adGroupId,
      keyword: record.keyword,
      matchType: record.matchType,
      spend: Number(record.spend),
      sales: Number(record.sales),
      acos: Number(record.acos),
      roi: Number(record.roi),
    })
  }

  return { data: items, total: items.length }
}

