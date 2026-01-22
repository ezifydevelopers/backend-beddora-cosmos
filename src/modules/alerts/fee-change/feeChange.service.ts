import prisma from '../../../config/db'
import { AppError } from '../../../middlewares/error.middleware'
import { FeeChangeAlertFilters, FeeChangeAlertsResponse } from './feeChange.types'

export async function getFeeChangeAlerts(
  userId: string,
  filters: FeeChangeAlertFilters
): Promise<FeeChangeAlertsResponse> {
  const where: any = {
    userId,
    marketplaceId: filters.marketplaceId || undefined,
    sku: filters.sku || undefined,
    feeType: filters.feeType || undefined,
    status: filters.status || undefined,
  }

  const alerts = await prisma.feeChangeAlert.findMany({
    where,
    orderBy: { timestamp: 'desc' },
  })

  return {
    data: alerts.map((alert) => ({
      id: alert.id,
      marketplaceId: alert.marketplaceId,
      productId: alert.productId,
      sku: alert.sku,
      feeType: alert.feeType,
      previousFee: alert.previousFee ? Number(alert.previousFee) : null,
      newFee: alert.newFee ? Number(alert.newFee) : null,
      changePercentage: alert.changePercentage ? Number(alert.changePercentage) : null,
      status: alert.status as 'unread' | 'read' | 'resolved',
      timestamp: alert.timestamp.toISOString(),
    })),
    total: alerts.length,
  }
}

export async function getFeeChangeAlertsByMarketplace(
  userId: string,
  marketplaceId: string,
  filters: FeeChangeAlertFilters
): Promise<FeeChangeAlertsResponse> {
  return getFeeChangeAlerts(userId, { ...filters, marketplaceId })
}

export async function markFeeChangeAlertResolved(userId: string, id: string) {
  const alert = await prisma.feeChangeAlert.findFirst({
    where: { id, userId },
  })
  if (!alert) {
    throw new AppError('Fee change alert not found', 404)
  }

  const updated = await prisma.feeChangeAlert.update({
    where: { id },
    data: { status: 'resolved' },
  })

  return {
    id: updated.id,
    status: updated.status,
  }
}

export async function markFeeChangeAlertRead(userId: string, id: string) {
  const alert = await prisma.feeChangeAlert.findFirst({
    where: { id, userId },
  })
  if (!alert) {
    throw new AppError('Fee change alert not found', 404)
  }

  const updated = await prisma.feeChangeAlert.update({
    where: { id },
    data: { status: 'read' },
  })

  return {
    id: updated.id,
    status: updated.status,
  }
}

