import prisma from '../../../config/db'
import { AppError } from '../../../middlewares/error.middleware'
import {
  BulkActionResult,
  BulkApplyRecommendationsInput,
  BulkBidUpdateInput,
  BulkHistoryResponse,
  BulkRevertInput,
  BulkStatusChangeInput,
  BulkTargetType,
} from './bulk.types'

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

function buildTargetIdsHint(targetType?: BulkTargetType, targetIds?: string[]) {
  if (!targetType || !targetIds || targetIds.length === 0) return undefined
  return targetIds[0]
}

function calculateAcos(spend: number, sales: number): number {
  return sales > 0 ? Number(((spend / sales) * 100).toFixed(2)) : 0
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

async function resolveKeywords(
  userId: string,
  input: {
    accountId: string
    marketplaceId?: string
    campaignId?: string
    adGroupId?: string
    keyword?: string
    sku?: string
    targetType?: BulkTargetType
    targetIds?: string[]
    amazonAccountId?: string
  }
) {
  const { accountId, marketplaceId, campaignId, adGroupId, keyword, sku, targetType, targetIds } =
    input

  await verifyAccountAccess(userId, accountId)

  const baseWhere: any = {
    accountId,
    marketplaceId: marketplaceId || undefined,
  }

  if (targetType && targetIds?.length) {
    if (targetType === 'campaign') {
      const adGroups = await prisma.pPCAdGroup.findMany({
        where: { campaignId: { in: targetIds } },
        select: { id: true },
      })
      const adGroupIds = adGroups.map((item) => item.id)
      return prisma.pPCKeyword.findMany({
        where: {
          ...baseWhere,
          adGroupId: { in: adGroupIds },
        },
        include: { adGroup: { select: { campaignId: true } } },
      })
    }

    if (targetType === 'adGroup') {
      return prisma.pPCKeyword.findMany({
        where: {
          ...baseWhere,
          adGroupId: { in: targetIds },
        },
        include: { adGroup: { select: { campaignId: true } } },
      })
    }

    return prisma.pPCKeyword.findMany({
      where: {
        ...baseWhere,
        OR: [{ id: { in: targetIds } }, { keyword: { in: targetIds } }],
      },
      include: { adGroup: { select: { campaignId: true } } },
    })
  }

  if (campaignId) {
    const adGroups = await prisma.pPCAdGroup.findMany({
      where: { campaignId },
      select: { id: true },
    })
    const adGroupIds = adGroups.map((item) => item.id)
    return prisma.pPCKeyword.findMany({
      where: { ...baseWhere, adGroupId: { in: adGroupIds } },
      include: { adGroup: { select: { campaignId: true } } },
    })
  }

  return prisma.pPCKeyword.findMany({
    where: {
      ...baseWhere,
      adGroupId: adGroupId || undefined,
      keyword: keyword ? { contains: keyword, mode: 'insensitive' } : undefined,
      ...(sku ? { keyword: { contains: sku, mode: 'insensitive' } } : {}),
    },
    include: { adGroup: { select: { campaignId: true } } },
  })
}

async function buildMetricsMap(
  userId: string,
  accountId: string,
  keywordTexts: string[],
  marketplaceId?: string,
  amazonAccountId?: string
) {
  if (keywordTexts.length === 0) {
    return new Map<string, { spend: number; sales: number }>()
  }

  const amazonAccountIds = await resolveAmazonAccounts(userId, accountId, amazonAccountId)
  const where: any = {
    amazonAccountId: { in: amazonAccountIds },
    marketplaceId: marketplaceId || undefined,
    keywordId: { in: keywordTexts },
  }

  const grouped = await prisma.pPCMetric.groupBy({
    by: ['keywordId'],
    where,
    _sum: { spend: true, sales: true },
  })

  const metricsMap = new Map<string, { spend: number; sales: number }>()
  for (const entry of grouped) {
    metricsMap.set(entry.keywordId || 'unknown', {
      spend: Number(entry._sum.spend || 0),
      sales: Number(entry._sum.sales || 0),
    })
  }
  return metricsMap
}

export async function bulkBidUpdate(userId: string, input: BulkBidUpdateInput): Promise<BulkActionResult> {
  const {
    accountId,
    marketplaceId,
    targetType,
    targetIds,
    newBid,
    minBid,
    maxBid,
    preview = false,
    reason = 'Bulk bid update',
  } = input

  if (!accountId) {
    throw new AppError('accountId is required', 400)
  }

  if (newBid <= 0) {
    throw new AppError('newBid must be greater than 0', 400)
  }

  const keywords = await resolveKeywords(userId, input)

  if (keywords.length === 0) {
    throw new AppError('No keywords matched the bulk update criteria', 404)
  }

  const nextBid = clampBid(newBid, minBid, maxBid)

  const previewItems = keywords.map((item) => ({
    keywordId: item.id,
    keyword: item.keyword,
    currentBid: Number(item.currentBid),
    newBid: nextBid,
  }))

  if (preview) {
    await prisma.pPCKeyword.updateMany({
      where: { id: { in: keywords.map((item) => item.id) } },
      data: {
        pendingBulkUpdate: { newBid: nextBid, reason },
      },
    })
    return {
      preview: true,
      applied: 0,
      skipped: 0,
      items: previewItems,
    }
  }

  const oldValues = previewItems.map((item) => ({
    keywordId: item.keywordId,
    currentBid: item.currentBid,
  }))

  await prisma.$transaction(async (tx) => {
    await tx.pPCKeyword.updateMany({
      where: { id: { in: keywords.map((item) => item.id) } },
      data: {
        currentBid: nextBid,
        suggestedBid: nextBid,
        lastBulkUpdatedAt: new Date(),
        pendingBulkUpdate: null,
      },
    })

    const history = await tx.pPCBulkHistory.create({
      data: {
        userId,
        accountId,
        targetType: targetType || 'keyword',
        targetIds: targetIds || keywords.map((item) => item.id),
        actionType: 'bidUpdate',
        oldValues,
        newValues: { newBid: nextBid },
        campaignId: targetType === 'campaign' ? buildTargetIdsHint(targetType, targetIds) : null,
        adGroupId: targetType === 'adGroup' ? buildTargetIdsHint(targetType, targetIds) : null,
        keywordId: targetType === 'keyword' ? buildTargetIdsHint(targetType, targetIds) : null,
      },
    })

    return history
  })

  return {
    preview: false,
    applied: previewItems.length,
    skipped: 0,
    items: previewItems,
  }
}

export async function bulkStatusChange(
  userId: string,
  input: BulkStatusChangeInput
): Promise<BulkActionResult> {
  const { accountId, marketplaceId, targetType, targetIds, status, preview = false, reason } = input

  if (!accountId) {
    throw new AppError('accountId is required', 400)
  }

  await verifyAccountAccess(userId, accountId)

  if (targetType === 'campaign' && targetIds?.length) {
    const campaigns = await prisma.pPCCampaign.findMany({
      where: { id: { in: targetIds }, accountId },
    })

    if (campaigns.length === 0) {
      throw new AppError('No campaigns matched the bulk update criteria', 404)
    }

    const previewItems = campaigns.map((item) => ({
      keywordId: item.id,
      keyword: item.campaignName,
      currentStatus: item.status,
      newStatus: status,
    }))

    if (preview) {
      return { preview: true, applied: 0, skipped: 0, items: previewItems }
    }

    await prisma.$transaction(async (tx) => {
      await tx.pPCCampaign.updateMany({
        where: { id: { in: targetIds }, accountId },
        data: { status },
      })

      await tx.pPCBulkHistory.create({
        data: {
          userId,
          accountId,
          targetType: 'campaign',
          targetIds,
          actionType: 'statusChange',
          oldValues: previewItems.map((item) => ({ id: item.keywordId, status: item.currentStatus })),
          newValues: { status },
          campaignId: buildTargetIdsHint('campaign', targetIds),
        },
      })
    })

    return { preview: false, applied: previewItems.length, skipped: 0, items: previewItems }
  }

  if (targetType === 'adGroup' && targetIds?.length) {
    const adGroups = await prisma.pPCAdGroup.findMany({
      where: { id: { in: targetIds }, accountId },
    })

    if (adGroups.length === 0) {
      throw new AppError('No ad groups matched the bulk update criteria', 404)
    }

    const previewItems = adGroups.map((item) => ({
      keywordId: item.id,
      keyword: item.adGroupName,
      currentStatus: (item as any).status || 'active',
      newStatus: status,
    }))

    if (preview) {
      return { preview: true, applied: 0, skipped: 0, items: previewItems }
    }

    await prisma.$transaction(async (tx) => {
      await tx.pPCAdGroup.updateMany({
        where: { id: { in: targetIds }, accountId },
        data: { status },
      })

      await tx.pPCBulkHistory.create({
        data: {
          userId,
          accountId,
          targetType: 'adGroup',
          targetIds,
          actionType: 'statusChange',
          oldValues: previewItems.map((item) => ({ id: item.keywordId, status: item.currentStatus })),
          newValues: { status },
          adGroupId: buildTargetIdsHint('adGroup', targetIds),
        },
      })
    })

    return { preview: false, applied: previewItems.length, skipped: 0, items: previewItems }
  }

  const keywords = await resolveKeywords(userId, input)

  if (keywords.length === 0) {
    throw new AppError('No keywords matched the bulk update criteria', 404)
  }

  const previewItems = keywords.map((item) => ({
    keywordId: item.id,
    keyword: item.keyword,
    currentStatus: item.status,
    newStatus: status,
  }))

  if (preview) {
    await prisma.pPCKeyword.updateMany({
      where: { id: { in: keywords.map((item) => item.id) } },
      data: {
        pendingBulkUpdate: { newStatus: status, reason },
      },
    })
    return { preview: true, applied: 0, skipped: 0, items: previewItems }
  }

  await prisma.$transaction(async (tx) => {
    await tx.pPCKeyword.updateMany({
      where: { id: { in: keywords.map((item) => item.id) } },
      data: { status, lastBulkUpdatedAt: new Date(), pendingBulkUpdate: null },
    })

    await tx.pPCBulkHistory.create({
      data: {
        userId,
        accountId,
        targetType: targetType || 'keyword',
        targetIds: targetIds || keywords.map((item) => item.id),
        actionType: 'statusChange',
        oldValues: previewItems.map((item) => ({ id: item.keywordId, status: item.currentStatus })),
        newValues: { status, reason },
        keywordId: targetType === 'keyword' ? buildTargetIdsHint(targetType, targetIds) : null,
      },
    })
  })

  return { preview: false, applied: previewItems.length, skipped: 0, items: previewItems }
}

export async function applyRecommendations(
  userId: string,
  input: BulkApplyRecommendationsInput
): Promise<BulkActionResult> {
  const { accountId, marketplaceId, minBid, maxBid, preview = false, reason } = input

  if (!accountId) {
    throw new AppError('accountId is required', 400)
  }

  const keywords = await resolveKeywords(userId, input)
  if (keywords.length === 0) {
    throw new AppError('No keywords matched the recommendation criteria', 404)
  }

  const metricsMap = await buildMetricsMap(
    userId,
    accountId,
    keywords.map((item) => item.keyword),
    marketplaceId,
    input.amazonAccountId
  )

  const previewItems = keywords.map((item) => {
    const metrics = metricsMap.get(item.keyword) || { spend: 0, sales: 0 }
    const spend = Number(metrics.spend)
    const sales = Number(metrics.sales)
    const acos = calculateAcos(spend, sales)
    const currentBid = Number(item.currentBid)
    const suggested = calculateSuggestedBid(currentBid, acos, item.targetAcos)
    const newBid = clampBid(suggested.suggestedBid, minBid, maxBid)

    return {
      keywordId: item.id,
      keyword: item.keyword,
      currentBid,
      newBid,
    }
  })

  if (preview) {
    await prisma.$transaction(
      previewItems.map((item) =>
        prisma.pPCKeyword.update({
          where: { id: item.keywordId },
          data: { pendingBulkUpdate: { newBid: item.newBid, reason } },
        })
      )
    )
    return { preview: true, applied: 0, skipped: 0, items: previewItems }
  }

  const updates = previewItems.filter((item) => item.newBid !== item.currentBid)

  await prisma.$transaction(async (tx) => {
    for (const update of updates) {
      await tx.pPCKeyword.update({
        where: { id: update.keywordId },
        data: {
          currentBid: update.newBid,
          suggestedBid: update.newBid,
          lastBulkUpdatedAt: new Date(),
          pendingBulkUpdate: null,
        },
      })
    }

    await tx.pPCBulkHistory.create({
      data: {
        userId,
        accountId,
        targetType: input.targetType || 'keyword',
        targetIds: input.targetIds || keywords.map((item) => item.id),
        actionType: 'recommendation',
        oldValues: updates.map((item) => ({ id: item.keywordId, bid: item.currentBid })),
        newValues: { reason: reason || 'Apply recommendations', updates },
        keywordId: input.targetType === 'keyword' ? buildTargetIdsHint(input.targetType, input.targetIds) : null,
      },
    })
  })

  return {
    preview: false,
    applied: updates.length,
    skipped: previewItems.length - updates.length,
    items: previewItems,
  }
}

export async function getBulkHistory(
  userId: string,
  filters: { accountId: string }
): Promise<BulkHistoryResponse> {
  const { accountId } = filters
  if (!accountId) {
    throw new AppError('accountId is required', 400)
  }

  await verifyAccountAccess(userId, accountId)

  const history = await prisma.pPCBulkHistory.findMany({
    where: { accountId },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })

  return {
    data: history.map((entry) => ({
      id: entry.id,
      actionType: entry.actionType,
      targetType: entry.targetType,
      targetIds: (entry.targetIds as string[]) || [],
      oldValues: entry.oldValues,
      newValues: entry.newValues,
      createdAt: entry.createdAt.toISOString(),
      userId: entry.userId,
    })),
    total: history.length,
  }
}

export async function revertBulkAction(
  userId: string,
  input: BulkRevertInput
): Promise<BulkActionResult> {
  const { accountId, historyId } = input
  if (!accountId || !historyId) {
    throw new AppError('accountId and historyId are required', 400)
  }

  await verifyAccountAccess(userId, accountId)

  const history = await prisma.pPCBulkHistory.findFirst({
    where: { id: historyId, accountId },
  })

  if (!history) {
    throw new AppError('Bulk history record not found', 404)
  }

  if (!history.oldValues) {
    throw new AppError('No reversible data found for this action', 400)
  }

  const items = Array.isArray(history.oldValues) ? history.oldValues : []

  if (items.length === 0) {
    throw new AppError('No reversible items found', 400)
  }

  if (history.actionType === 'statusChange') {
    await prisma.$transaction(async (tx) => {
      for (const item of items) {
        if (history.targetType === 'campaign') {
          await tx.pPCCampaign.update({
            where: { id: item.id },
            data: { status: item.status },
          })
        } else if (history.targetType === 'adGroup') {
          await tx.pPCAdGroup.update({
            where: { id: item.id },
            data: { status: item.status },
          })
        } else {
          await tx.pPCKeyword.update({
            where: { id: item.id },
            data: { status: item.status },
          })
        }
      }
    })
  }

  if (history.actionType === 'bidUpdate' || history.actionType === 'recommendation') {
    await prisma.$transaction(async (tx) => {
      for (const item of items) {
        await tx.pPCKeyword.update({
          where: { id: item.keywordId || item.id },
          data: { currentBid: item.currentBid || item.bid },
        })
      }
    })
  }

  return {
    preview: false,
    applied: items.length,
    skipped: 0,
    items: items.map((item: any) => ({
      keywordId: item.keywordId || item.id,
      keyword: item.keyword || '',
      currentBid: item.currentBid || item.bid,
    })),
  }
}

