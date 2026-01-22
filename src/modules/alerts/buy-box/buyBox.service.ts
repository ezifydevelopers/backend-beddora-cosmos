import prisma from '../../../config/db'
import { AppError } from '../../../middlewares/error.middleware'
import { BuyBoxAlertFilters, BuyBoxAlertsResponse } from './buyBox.types'

export async function getBuyBoxAlerts(
  userId: string,
  filters: BuyBoxAlertFilters
): Promise<BuyBoxAlertsResponse> {
  const where: any = {
    userId,
    marketplaceId: filters.marketplaceId || undefined,
    asin: filters.asin || undefined,
    sku: filters.sku || undefined,
    status: filters.status || undefined,
  }

  const alerts = await prisma.buyBoxAlert.findMany({
    where,
    orderBy: { timestamp: 'desc' },
  })

  return {
    data: alerts.map((alert) => ({
      id: alert.id,
      marketplaceId: alert.marketplaceId,
      asin: alert.asin,
      sku: alert.sku,
      lostBuyBox: alert.lostBuyBox,
      previousPrice: alert.previousPrice ? Number(alert.previousPrice) : null,
      newPrice: alert.newPrice ? Number(alert.newPrice) : null,
      competitorChanges: alert.competitorChanges,
      status: alert.status as 'unread' | 'read' | 'resolved',
      timestamp: alert.timestamp.toISOString(),
    })),
    total: alerts.length,
  }
}

export async function getBuyBoxAlertsByAsin(
  userId: string,
  asin: string,
  filters: BuyBoxAlertFilters
): Promise<BuyBoxAlertsResponse> {
  return getBuyBoxAlerts(userId, { ...filters, asin })
}

export async function markBuyBoxAlertResolved(userId: string, id: string) {
  const alert = await prisma.buyBoxAlert.findFirst({
    where: { id, userId },
  })
  if (!alert) {
    throw new AppError('Buy Box alert not found', 404)
  }

  const updated = await prisma.buyBoxAlert.update({
    where: { id },
    data: { status: 'resolved' },
  })

  return {
    id: updated.id,
    status: updated.status,
  }
}

export async function markBuyBoxAlertRead(userId: string, id: string) {
  const alert = await prisma.buyBoxAlert.findFirst({
    where: { id, userId },
  })
  if (!alert) {
    throw new AppError('Buy Box alert not found', 404)
  }

  const updated = await prisma.buyBoxAlert.update({
    where: { id },
    data: { status: 'read' },
  })

  return {
    id: updated.id,
    status: updated.status,
  }
}

