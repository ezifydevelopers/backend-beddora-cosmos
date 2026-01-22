import prisma from '../../../config/db'
import { AppError } from '../../../middlewares/error.middleware'
import { FeedbackReviewAlertFilters, FeedbackReviewAlertsResponse } from './feedbackReview.types'

export async function getFeedbackAlerts(
  userId: string,
  filters: FeedbackReviewAlertFilters
): Promise<FeedbackReviewAlertsResponse> {
  const where: any = {
    userId,
    marketplaceId: filters.marketplaceId || undefined,
    asin: filters.asin || undefined,
    sku: filters.sku || undefined,
    status: filters.status || undefined,
  }

  if (typeof filters.rating === 'number') {
    where.newRating = { lte: filters.rating }
  }

  const alerts = await prisma.feedbackReviewAlert.findMany({
    where,
    orderBy: { timestamp: 'desc' },
  })

  return {
    data: alerts.map((alert) => ({
      id: alert.id,
      marketplaceId: alert.marketplaceId,
      asin: alert.asin,
      productId: alert.productId,
      sku: alert.sku,
      previousRating: alert.previousRating ? Number(alert.previousRating) : null,
      newRating: alert.newRating ? Number(alert.newRating) : null,
      reviewText: alert.reviewText,
      reviewer: alert.reviewer,
      status: alert.status as 'unread' | 'read' | 'resolved',
      timestamp: alert.timestamp.toISOString(),
    })),
    total: alerts.length,
  }
}

export async function getFeedbackAlertsByAsin(
  userId: string,
  asin: string,
  filters: FeedbackReviewAlertFilters
): Promise<FeedbackReviewAlertsResponse> {
  return getFeedbackAlerts(userId, { ...filters, asin })
}

export async function markFeedbackAlertResolved(userId: string, id: string) {
  const alert = await prisma.feedbackReviewAlert.findFirst({
    where: { id, userId },
  })
  if (!alert) {
    throw new AppError('Feedback alert not found', 404)
  }

  const updated = await prisma.feedbackReviewAlert.update({
    where: { id },
    data: { status: 'resolved' },
  })

  return {
    id: updated.id,
    status: updated.status,
  }
}

export async function markFeedbackAlertRead(userId: string, id: string) {
  const alert = await prisma.feedbackReviewAlert.findFirst({
    where: { id, userId },
  })
  if (!alert) {
    throw new AppError('Feedback alert not found', 404)
  }

  const updated = await prisma.feedbackReviewAlert.update({
    where: { id },
    data: { status: 'read' },
  })

  return {
    id: updated.id,
    status: updated.status,
  }
}

