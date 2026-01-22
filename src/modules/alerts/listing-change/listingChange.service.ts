import prisma from '../../../config/db'
import { AppError } from '../../../middlewares/error.middleware'
import { ListingAlertFilters, ListingAlertsResponse } from './listingChange.types'

export async function getListingAlerts(
  userId: string,
  filters: ListingAlertFilters
): Promise<ListingAlertsResponse> {
  const where: any = {
    userId,
    marketplaceId: filters.marketplaceId || undefined,
    asin: filters.asin || undefined,
    sku: filters.sku || undefined,
    status: filters.status || undefined,
  }

  const alerts = await prisma.listingAlert.findMany({
    where,
    orderBy: { timestamp: 'desc' },
  })

  return {
    data: alerts.map((alert) => ({
      id: alert.id,
      marketplaceId: alert.marketplaceId,
      asin: alert.asin,
      sku: alert.sku,
      previousTitle: alert.previousTitle,
      newTitle: alert.newTitle,
      previousDescription: alert.previousDescription,
      newDescription: alert.newDescription,
      previousImages: alert.previousImages,
      newImages: alert.newImages,
      previousCategory: alert.previousCategory,
      newCategory: alert.newCategory,
      newSellerDetected: alert.newSellerDetected,
      status: alert.status as 'unread' | 'read' | 'resolved',
      timestamp: alert.timestamp.toISOString(),
    })),
    total: alerts.length,
  }
}

export async function getListingAlertsByAsin(
  userId: string,
  asin: string,
  filters: ListingAlertFilters
): Promise<ListingAlertsResponse> {
  return getListingAlerts(userId, { ...filters, asin })
}

export async function markAlertResolved(userId: string, id: string) {
  const alert = await prisma.listingAlert.findFirst({
    where: { id, userId },
  })
  if (!alert) {
    throw new AppError('Listing alert not found', 404)
  }

  const updated = await prisma.listingAlert.update({
    where: { id },
    data: { status: 'resolved' },
  })

  return {
    id: updated.id,
    status: updated.status,
  }
}

export async function markAlertRead(userId: string, id: string) {
  const alert = await prisma.listingAlert.findFirst({
    where: { id, userId },
  })
  if (!alert) {
    throw new AppError('Listing alert not found', 404)
  }

  const updated = await prisma.listingAlert.update({
    where: { id },
    data: { status: 'read' },
  })

  return {
    id: updated.id,
    status: updated.status,
  }
}

