import prisma from '../../../config/db'
import { AppError } from '../../../middlewares/error.middleware'
import {
  KeywordHarvestSuggestion,
  PPCOptimizationFilters,
  PPCOptimizationHistoryResponse,
  PPCOptimizationItem,
  PPCOptimizationRunInput,
  PPCOptimizationRunResult,
  PPCOptimizationStatusResponse,
} from './optimization.types'

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

function calculateSuggestedBid(
  currentBid: number,
  acos: number,
  targetAcos?: number | null
): { suggestedBid: number; reason?: string } {
  if (!targetAcos || currentBid <= 0) {
    return { suggestedBid: currentBid }
  }

  const variance = (acos - targetAcos) / targetAcos
  if (Math.abs(variance) < 0.05) {
    return { suggestedBid: currentBid }
  }

  const adjustment = Math.min(Math.max(1 - variance, 0.7), 1.3)
  const suggestedBid = Number((currentBid * adjustment).toFixed(2))
  return {
    suggestedBid,
    reason: variance > 0 ? 'Reduce bid to meet target ACOS' : 'Increase bid to reach target ACOS',
  }
}

function clampBid(bid: number, minBid?: number, maxBid?: number): number {
  let value = bid
  if (typeof minBid === 'number') value = Math.max(value, minBid)
  if (typeof maxBid === 'number') value = Math.min(value, maxBid)
  return Number(value.toFixed(2))
}

function shouldPauseKeyword(acos: number, sales: number, spend: number, threshold?: number): boolean {
  if (sales === 0 && spend > 20) {
    return true
  }
  if (threshold && acos > threshold) {
    return true
  }
  return false
}

function buildHarvestingSuggestions(
  items: Array<{ keyword: string; acos: number; sales: number; spend: number; targetAcos?: number | null }>
): KeywordHarvestSuggestion[] {
  const suggestions: KeywordHarvestSuggestion[] = []
  for (const item of items) {
    if (item.sales > 0 && item.targetAcos && item.acos < item.targetAcos * 0.7) {
      suggestions.push({
        keyword: item.keyword,
        action: 'positive',
        reason: 'High-performing keyword below target ACOS',
      })
    } else if ((item.sales === 0 && item.spend > 25) || (item.targetAcos && item.acos > item.targetAcos * 1.6)) {
      suggestions.push({
        keyword: item.keyword,
        action: 'negative',
        reason: 'Underperforming keyword above target ACOS',
      })
    }
  }
  return suggestions
}

export async function getOptimizationStatus(
  userId: string,
  filters: PPCOptimizationFilters
): Promise<PPCOptimizationStatusResponse> {
  const { accountId, amazonAccountId, marketplaceId, campaignId, adGroupId, keyword, startDate, endDate } =
    filters

  if (!accountId) {
    throw new AppError('accountId is required', 400)
  }

  await verifyAccountAccess(userId, accountId)
  const amazonAccountIds = await resolveAmazonAccounts(userId, accountId, amazonAccountId)

  const keywordWhere: any = {
    accountId,
    marketplaceId: marketplaceId || undefined,
    adGroupId: adGroupId || undefined,
    keyword: keyword ? { contains: keyword, mode: 'insensitive' } : undefined,
  }

  if (campaignId) {
    keywordWhere.adGroup = { campaignId }
  }

  const keywords = await prisma.pPCKeyword.findMany({
    where: keywordWhere,
    include: { adGroup: { select: { campaignId: true } } },
    orderBy: { updatedAt: 'desc' },
  })

  const keywordIds = keywords.map((item) => item.keyword)
  const metricsWhere: any = {
    amazonAccountId: { in: amazonAccountIds },
    marketplaceId: marketplaceId || undefined,
    keywordId: keywordIds.length > 0 ? { in: keywordIds } : undefined,
  }
  const dateFilter = buildDateFilter(startDate, endDate)
  if (dateFilter) metricsWhere.date = dateFilter

  const grouped = keywordIds.length
    ? await prisma.pPCMetric.groupBy({
        by: ['keywordId'],
        where: metricsWhere,
        _sum: { spend: true, sales: true },
      })
    : []

  const metricsMap = new Map<string, { spend: number; sales: number }>()
  for (const entry of grouped) {
    metricsMap.set(entry.keywordId || 'unknown', {
      spend: Number(entry._sum.spend || 0),
      sales: Number(entry._sum.sales || 0),
    })
  }

  let suggestedChanges = 0
  let pausedKeywords = 0

  const items: PPCOptimizationItem[] = keywords.map((item) => {
    const metrics = metricsMap.get(item.keyword) || { spend: 0, sales: 0 }
    const spend = Number(metrics.spend)
    const sales = Number(metrics.sales)
    const acos = calculateAcos(spend, sales)
    const roi = calculateRoi(spend, sales)
    const currentBid = Number(item.currentBid)
    const { suggestedBid, reason } = calculateSuggestedBid(currentBid, acos, item.targetAcos)

    if (suggestedBid !== currentBid) suggestedChanges += 1
    if (item.status === 'paused') pausedKeywords += 1

    return {
      id: item.id,
      keyword: item.keyword,
      matchType: item.matchType,
      adGroupId: item.adGroupId,
      campaignId: item.adGroup?.campaignId,
      spend,
      sales,
      acos,
      roi,
      targetAcos: item.targetAcos ? Number(item.targetAcos) : null,
      targetProfitability: item.targetProfitability ? Number(item.targetProfitability) : null,
      currentBid,
      suggestedBid,
      optimizationMode: item.optimizationMode as 'manual' | 'autoplay',
      status: item.status as 'active' | 'paused' | 'negative',
      lastOptimizedAt: item.lastOptimizedAt ? item.lastOptimizedAt.toISOString() : null,
      suggestedAction: reason || null,
    }
  })

  const harvesting = buildHarvestingSuggestions(
    items.map((item) => ({
      keyword: item.keyword,
      acos: item.acos,
      sales: item.sales,
      spend: item.spend,
      targetAcos: item.targetAcos,
    }))
  )

  return {
    summary: {
      totalKeywords: items.length,
      autoplayKeywords: items.filter((item) => item.optimizationMode === 'autoplay').length,
      manualKeywords: items.filter((item) => item.optimizationMode === 'manual').length,
      suggestedChanges,
      pausedKeywords,
    },
    items,
    harvesting,
  }
}

export async function runOptimization(
  userId: string,
  input: PPCOptimizationRunInput
): Promise<PPCOptimizationRunResult> {
  const {
    minBid = 0.1,
    maxBid = 5,
    pauseAcosThreshold,
    negativeAcosThreshold = pauseAcosThreshold ? pauseAcosThreshold * 1.2 : undefined,
  } = input

  const status = await getOptimizationStatus(userId, input)
  const applied: PPCOptimizationRunResult['applied'] = []

  for (const item of status.items) {
    if (item.optimizationMode !== 'autoplay') {
      continue
    }

    const suggestedBid = clampBid(item.suggestedBid ?? item.currentBid, minBid, maxBid)
    const shouldPause = shouldPauseKeyword(item.acos, item.sales, item.spend, pauseAcosThreshold)
    const shouldNegative = negativeAcosThreshold ? item.acos > negativeAcosThreshold : false

    if (suggestedBid === item.currentBid && !shouldPause && !shouldNegative) {
      continue
    }

    const reason = shouldNegative
      ? 'Marked as negative due to poor ACOS'
      : shouldPause
        ? 'Paused due to underperformance'
        : item.suggestedAction || 'Bid adjusted'

    await prisma.pPCKeyword.update({
      where: { id: item.id },
      data: {
        currentBid: suggestedBid,
        suggestedBid,
        status: shouldNegative ? 'negative' : shouldPause ? 'paused' : item.status,
        lastOptimizedAt: new Date(),
      },
    })

    await prisma.pPCOptimizationHistory.create({
      data: {
        keywordId: item.id,
        previousBid: item.currentBid,
        newBid: suggestedBid,
        reason,
      },
    })

    applied.push({
      keywordId: item.id,
      previousBid: item.currentBid,
      newBid: suggestedBid,
      reason,
    })
  }

  return {
    updated: applied.length,
    skipped: status.items.length - applied.length,
    applied,
  }
}

export async function updateKeywordBid(
  userId: string,
  keywordId: string,
  data: {
    accountId: string
    currentBid?: number
    targetAcos?: number
    targetProfitability?: number
    optimizationMode?: 'manual' | 'autoplay'
    status?: 'active' | 'paused' | 'negative'
  }
): Promise<PPCOptimizationItem> {
  if (!data.accountId) {
    throw new AppError('accountId is required', 400)
  }

  await verifyAccountAccess(userId, data.accountId)

  const keyword = await prisma.pPCKeyword.findFirst({
    where: { id: keywordId, accountId: data.accountId },
    include: { adGroup: { select: { campaignId: true } } },
  })

  if (!keyword) {
    throw new AppError('Keyword not found', 404)
  }

  const previousBid = Number(keyword.currentBid)
  const nextBid = typeof data.currentBid === 'number' ? data.currentBid : previousBid

  const updated = await prisma.pPCKeyword.update({
    where: { id: keywordId },
    data: {
      currentBid: nextBid,
      targetAcos: data.targetAcos ?? keyword.targetAcos,
      targetProfitability: data.targetProfitability ?? keyword.targetProfitability,
      optimizationMode: data.optimizationMode ?? keyword.optimizationMode,
      status: data.status ?? keyword.status,
    },
  })

  if (nextBid !== previousBid) {
    await prisma.pPCOptimizationHistory.create({
      data: {
        keywordId: keywordId,
        previousBid,
        newBid: nextBid,
        reason: 'Manual bid update',
      },
    })
  }

  const spend = Number(updated.spend)
  const sales = Number(updated.sales)

  return {
    id: updated.id,
    keyword: updated.keyword,
    matchType: updated.matchType,
    adGroupId: updated.adGroupId,
    campaignId: keyword.adGroup?.campaignId,
    spend,
    sales,
    acos: calculateAcos(spend, sales),
    roi: calculateRoi(spend, sales),
    targetAcos: updated.targetAcos ? Number(updated.targetAcos) : null,
    targetProfitability: updated.targetProfitability ? Number(updated.targetProfitability) : null,
    currentBid: Number(updated.currentBid),
    suggestedBid: updated.suggestedBid ? Number(updated.suggestedBid) : null,
    optimizationMode: updated.optimizationMode as 'manual' | 'autoplay',
    status: updated.status as 'active' | 'paused' | 'negative',
    lastOptimizedAt: updated.lastOptimizedAt ? updated.lastOptimizedAt.toISOString() : null,
    suggestedAction: null,
  }
}

export async function getOptimizationHistory(
  userId: string,
  filters: PPCOptimizationFilters & { keywordId?: string }
): Promise<PPCOptimizationHistoryResponse> {
  const { accountId, keywordId } = filters
  if (!accountId) {
    throw new AppError('accountId is required', 400)
  }

  await verifyAccountAccess(userId, accountId)

  const history = await prisma.pPCOptimizationHistory.findMany({
    where: keywordId
      ? { keywordId }
      : {
          keyword: {
            accountId,
          },
        },
    include: { keyword: true },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })

  return {
    data: history.map((entry) => ({
      id: entry.id,
      keywordId: entry.keywordId,
      keyword: entry.keyword.keyword,
      previousBid: entry.previousBid ? Number(entry.previousBid) : null,
      newBid: entry.newBid ? Number(entry.newBid) : null,
      reason: entry.reason,
      createdAt: entry.createdAt.toISOString(),
    })),
    total: history.length,
  }
}

