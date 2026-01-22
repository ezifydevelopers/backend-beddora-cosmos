import prisma from '../../../config/db'
import { AppError } from '../../../middlewares/error.middleware'
import {
  ReturnFilters,
  ReturnInput,
  ReturnSummary,
  ReturnUpdateInput,
} from '../../../types/returns.types'

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

async function verifyOrderAccess(userId: string, orderId: string, accountId?: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  })

  if (!order) {
    throw new AppError('Order not found', 404)
  }

  if (accountId) {
    await verifyAccountAccess(userId, accountId)
    if (order.accountId !== accountId) {
      throw new AppError('Order does not belong to account', 403)
    }
  } else {
    await verifyAccountAccess(userId, order.accountId)
  }

  return order
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

function formatPeriodKey(date: Date, period: 'day' | 'week' | 'month') {
  switch (period) {
    case 'week': {
      const weekStart = new Date(date)
      weekStart.setDate(date.getDate() - date.getDay() + 1)
      return weekStart.toISOString().split('T')[0]
    }
    case 'month':
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    case 'day':
    default:
      return date.toISOString().split('T')[0]
  }
}

export async function getReturns(userId: string, filters: ReturnFilters) {
  const { accountId, marketplaceId, sku, reasonCode, startDate, endDate } = filters

  if (!accountId) {
    throw new AppError('accountId is required', 400)
  }

  await verifyAccountAccess(userId, accountId)

  const dateFilter = buildDateFilter(startDate, endDate)

  const where: any = {
    accountId,
  }

  if (marketplaceId) where.marketplaceId = marketplaceId
  if (sku) where.sku = sku
  if (reasonCode) where.reasonCode = reasonCode
  if (dateFilter) where.createdAt = dateFilter

  const returns = await prisma.return.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  })

  return {
    success: true,
    data: returns,
    totalRecords: returns.length,
  }
}

export async function createReturn(userId: string, data: ReturnInput) {
  const order = await verifyOrderAccess(userId, data.orderId, data.accountId)

  const hasSku = order.items.some((item) => item.sku === data.sku)
  if (!hasSku) {
    throw new AppError('SKU not found in order', 400)
  }

  const created = await prisma.return.create({
    data: {
      orderId: data.orderId,
      sku: data.sku,
      accountId: data.accountId,
      marketplaceId: data.marketplaceId || order.marketplaceId || null,
      quantityReturned: data.quantityReturned,
      reasonCode: data.reasonCode,
      refundAmount: data.refundAmount,
      feeAmount: data.feeAmount,
      isSellable: data.isSellable,
    },
  })

  return {
    success: true,
    data: created,
  }
}

export async function updateReturn(userId: string, returnId: string, data: ReturnUpdateInput) {
  const existing = await prisma.return.findUnique({
    where: { id: returnId },
  })

  if (!existing) {
    throw new AppError('Return not found', 404)
  }

  await verifyAccountAccess(userId, existing.accountId)

  const updated = await prisma.return.update({
    where: { id: returnId },
    data: {
      sku: data.sku,
      marketplaceId: data.marketplaceId,
      quantityReturned: data.quantityReturned,
      reasonCode: data.reasonCode,
      refundAmount: data.refundAmount,
      feeAmount: data.feeAmount,
      isSellable: data.isSellable,
    },
  })

  return {
    success: true,
    data: updated,
  }
}

export async function deleteReturn(userId: string, returnId: string) {
  const existing = await prisma.return.findUnique({
    where: { id: returnId },
  })

  if (!existing) {
    throw new AppError('Return not found', 404)
  }

  await verifyAccountAccess(userId, existing.accountId)

  await prisma.return.delete({
    where: { id: returnId },
  })

  return {
    success: true,
    message: 'Return deleted successfully',
  }
}

export async function getReturnsSummary(userId: string, filters: ReturnFilters): Promise<ReturnSummary> {
  const { accountId, marketplaceId, sku, reasonCode, startDate, endDate, period = 'day' } = filters

  if (!accountId) {
    throw new AppError('accountId is required', 400)
  }

  await verifyAccountAccess(userId, accountId)

  const dateFilter = buildDateFilter(startDate, endDate)

  const where: any = { accountId }
  if (marketplaceId) where.marketplaceId = marketplaceId
  if (sku) where.sku = sku
  if (reasonCode) where.reasonCode = reasonCode
  if (dateFilter) where.createdAt = dateFilter

  const returns = await prisma.return.findMany({ where })

  const summary: ReturnSummary = {
    totalReturnedUnits: 0,
    totalRefundAmount: 0,
    totalFeeAmount: 0,
    sellableUnits: 0,
    unsellableUnits: 0,
    lostUnits: 0,
    byReasonCode: {},
    byMarketplace: {},
    trends: [],
  }

  const trendMap = new Map<string, { units: number; refundAmount: number; feeAmount: number }>()

  for (const entry of returns) {
    summary.totalReturnedUnits += entry.quantityReturned
    summary.totalRefundAmount += Number(entry.refundAmount)
    summary.totalFeeAmount += Number(entry.feeAmount)

    if (entry.isSellable) {
      summary.sellableUnits += entry.quantityReturned
    } else {
      summary.unsellableUnits += entry.quantityReturned
    }

    const reasonKey = entry.reasonCode || 'unknown'
    if (!summary.byReasonCode[reasonKey]) {
      summary.byReasonCode[reasonKey] = { units: 0, refundAmount: 0, feeAmount: 0 }
    }
    summary.byReasonCode[reasonKey].units += entry.quantityReturned
    summary.byReasonCode[reasonKey].refundAmount += Number(entry.refundAmount)
    summary.byReasonCode[reasonKey].feeAmount += Number(entry.feeAmount)

    const marketplaceKey = entry.marketplaceId || 'unknown'
    if (!summary.byMarketplace[marketplaceKey]) {
      summary.byMarketplace[marketplaceKey] = { units: 0, refundAmount: 0, feeAmount: 0 }
    }
    summary.byMarketplace[marketplaceKey].units += entry.quantityReturned
    summary.byMarketplace[marketplaceKey].refundAmount += Number(entry.refundAmount)
    summary.byMarketplace[marketplaceKey].feeAmount += Number(entry.feeAmount)

    const periodKey = formatPeriodKey(entry.createdAt, period)
    if (!trendMap.has(periodKey)) {
      trendMap.set(periodKey, { units: 0, refundAmount: 0, feeAmount: 0 })
    }
    const trend = trendMap.get(periodKey)!
    trend.units += entry.quantityReturned
    trend.refundAmount += Number(entry.refundAmount)
    trend.feeAmount += Number(entry.feeAmount)
  }

  summary.lostUnits = summary.unsellableUnits

  summary.trends = Array.from(trendMap.entries())
    .map(([periodKey, values]) => ({
      period: periodKey,
      units: values.units,
      refundAmount: Number(values.refundAmount.toFixed(2)),
      feeAmount: Number(values.feeAmount.toFixed(2)),
    }))
    .sort((a, b) => a.period.localeCompare(b.period))

  summary.totalRefundAmount = Number(summary.totalRefundAmount.toFixed(2))
  summary.totalFeeAmount = Number(summary.totalFeeAmount.toFixed(2))

  return summary
}

