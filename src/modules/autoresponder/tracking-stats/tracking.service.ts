/**
 * Tracking & Stats Service
 * 
 * Business logic for tracking email interactions and review statistics.
 * Handles aggregation, filtering, and reporting.
 */

import prisma from '../../../config/db'
import { AppError } from '../../../middlewares/error.middleware'
import { logger } from '../../../config/logger'
import {
  EmailStatsFilters,
  EmailStatsResponse,
  ReviewStatsFilters,
  ReviewStatsResponse,
  TrackEmailInteractionInput,
  UpdateReviewStatsInput,
  EmailEventType,
} from './tracking.types'

/**
 * Verify that the user has access to the specified account
 */
async function verifyAccountAccess(userId: string, accountId?: string | null): Promise<void> {
  if (!accountId) return

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

/**
 * Track an email interaction (open, click, bounce, delivered)
 * This should be called from webhooks or email service callbacks
 */
export async function trackEmailInteraction(
  input: TrackEmailInteractionInput
): Promise<void> {
  // Verify email queue item exists
  const emailQueue = await prisma.emailQueue.findUnique({
    where: { id: input.emailQueueId },
  })

  if (!emailQueue) {
    throw new AppError('Email queue item not found', 404)
  }

  // Create interaction record
  await prisma.emailInteraction.create({
    data: {
      emailQueueId: input.emailQueueId,
      eventType: input.eventType,
      metadata: input.metadata || null,
    },
  })

  // Update email queue counters
  const updateData: any = {}
  if (input.eventType === 'open') {
    updateData.openedCount = { increment: 1 }
  } else if (input.eventType === 'click') {
    updateData.clickedCount = { increment: 1 }
  } else if (input.eventType === 'delivered') {
    // Mark as delivered if not already sent
    if (emailQueue.status === 'pending') {
      updateData.status = 'sent'
      updateData.sentAt = new Date()
    }
  } else if (input.eventType === 'bounce') {
    updateData.status = 'failed'
    updateData.errorMessage = 'Email bounced'
  }

  if (Object.keys(updateData).length > 0) {
    await prisma.emailQueue.update({
      where: { id: input.emailQueueId },
      data: updateData,
    })
  }

  logger.info('Email interaction tracked', {
    emailQueueId: input.emailQueueId,
    eventType: input.eventType,
  })
}

/**
 * Get email interaction statistics
 */
export async function getEmailStats(
  userId: string,
  filters?: EmailStatsFilters
): Promise<EmailStatsResponse> {
  // Verify account access if provided
  if (filters?.accountId) {
    await verifyAccountAccess(userId, filters.accountId)
  }

  // Build where clause for email queue
  const emailQueueWhere: any = {
    template: {
      userId,
    },
  }

  if (filters?.accountId) {
    // Get templates for this account
    emailQueueWhere.template = {
      userId,
      // Note: Account filtering would need to be added to EmailTemplate model
      // For now, we'll filter by user only
    }
  }

  if (filters?.templateId) {
    emailQueueWhere.templateId = filters.templateId
  }

  if (filters?.startDate || filters?.endDate) {
    emailQueueWhere.scheduledAt = {}
    if (filters.startDate) {
      emailQueueWhere.scheduledAt.gte = filters.startDate
    }
    if (filters.endDate) {
      emailQueueWhere.scheduledAt.lte = filters.endDate
    }
  }

  // Get all email queue items matching filters
  const emailQueues = await prisma.emailQueue.findMany({
    where: emailQueueWhere,
    include: {
      template: {
        select: {
          id: true,
          name: true,
        },
      },
      interactions: true,
    },
  })

  // Calculate aggregate stats
  let totalSent = 0
  let totalDelivered = 0
  let totalOpened = 0
  let totalClicked = 0
  let totalBounced = 0
  let totalFailed = 0

  const templateStats = new Map<string, {
    templateId: string
    templateName: string
    sent: number
    delivered: number
    opened: number
    clicked: number
    bounced: number
  }>()

  for (const queue of emailQueues) {
    if (queue.status === 'sent' || queue.status === 'failed') {
      totalSent++
    }
    if (queue.status === 'sent') {
      totalDelivered++
    }
    if (queue.status === 'failed') {
      totalFailed++
    }

    // Count interactions
    for (const interaction of queue.interactions) {
      if (interaction.eventType === 'delivered') {
        totalDelivered++
      } else if (interaction.eventType === 'open') {
        totalOpened++
      } else if (interaction.eventType === 'click') {
        totalClicked++
      } else if (interaction.eventType === 'bounce') {
        totalBounced++
      }
    }

    // Aggregate by template
    const templateId = queue.templateId
    if (!templateStats.has(templateId)) {
      templateStats.set(templateId, {
        templateId,
        templateName: queue.template.name,
        sent: 0,
        delivered: 0,
        opened: 0,
        clicked: 0,
        bounced: 0,
      })
    }

    const stats = templateStats.get(templateId)!
    if (queue.status === 'sent' || queue.status === 'failed') {
      stats.sent++
    }
    if (queue.status === 'sent') {
      stats.delivered++
    }
    if (queue.status === 'failed') {
      stats.bounced++
    }
    stats.opened += queue.openedCount
    stats.clicked += queue.clickedCount
  }

  // Calculate rates
  const openRate = totalSent > 0 ? (totalOpened / totalSent) * 100 : 0
  const clickRate = totalSent > 0 ? (totalClicked / totalSent) * 100 : 0
  const bounceRate = totalSent > 0 ? (totalBounced / totalSent) * 100 : 0
  const deliveryRate = totalSent > 0 ? (totalDelivered / totalSent) * 100 : 0

  // Format template stats with rates
  const byTemplate = Array.from(templateStats.values()).map((stats) => ({
    ...stats,
    openRate: stats.sent > 0 ? (stats.opened / stats.sent) * 100 : 0,
    clickRate: stats.sent > 0 ? (stats.clicked / stats.sent) * 100 : 0,
  }))

  return {
    totalSent,
    totalDelivered,
    totalOpened,
    totalClicked,
    totalBounced,
    totalFailed,
    openRate: Math.round(openRate * 100) / 100,
    clickRate: Math.round(clickRate * 100) / 100,
    bounceRate: Math.round(bounceRate * 100) / 100,
    deliveryRate: Math.round(deliveryRate * 100) / 100,
    byTemplate,
  }
}

/**
 * Get email stats for a specific template
 */
export async function getEmailStatsByTemplate(
  userId: string,
  templateId: string,
  filters?: Omit<EmailStatsFilters, 'templateId'>
): Promise<EmailStatsResponse> {
  return getEmailStats(userId, { ...filters, templateId })
}

/**
 * Update review statistics when a review is received
 */
export async function updateReviewStats(
  input: UpdateReviewStatsInput
): Promise<void> {
  // Verify template belongs to user
  const template = await prisma.emailTemplate.findFirst({
    where: {
      id: input.templateId,
      userId: input.userId,
    },
  })

  if (!template) {
    throw new AppError('Email template not found or access denied', 404)
  }

  // Find or create review stats record
  const where: any = {
    templateId: input.templateId,
    userId: input.userId,
  }

  if (input.accountId) where.accountId = input.accountId
  if (input.marketplaceId) where.marketplaceId = input.marketplaceId
  if (input.productId) where.productId = input.productId
  if (input.asin) where.asin = input.asin
  if (input.sku) where.sku = input.sku

  const existing = await prisma.reviewStats.findFirst({
    where,
  })

  const updateData: any = {
    sentCount: { increment: 1 },
    lastUpdated: new Date(),
  }

  if (input.reviewReceived) {
    updateData.reviewReceivedCount = { increment: 1 }
    if (input.isPositive) {
      updateData.positiveReviews = { increment: 1 }
    } else {
      updateData.negativeReviews = { increment: 1 }
    }

    // Update response times
    if (input.responseTimeHours !== undefined) {
      const currentResponseTimes = (existing?.responseTimes as {
        min?: number
        max?: number
        average?: number
        count?: number
      }) || { min: input.responseTimeHours, max: input.responseTimeHours, average: input.responseTimeHours, count: 0 }

      const newCount = (currentResponseTimes.count || 0) + 1
      const newMin = Math.min(currentResponseTimes.min || input.responseTimeHours, input.responseTimeHours)
      const newMax = Math.max(currentResponseTimes.max || input.responseTimeHours, input.responseTimeHours)
      const newAverage =
        ((currentResponseTimes.average || 0) * (newCount - 1) + input.responseTimeHours) / newCount

      updateData.responseTimes = {
        min: newMin,
        max: newMax,
        average: Math.round(newAverage * 100) / 100,
        count: newCount,
      }
    }
  }

  if (existing) {
    await prisma.reviewStats.update({
      where: { id: existing.id },
      data: updateData,
    })
  } else {
    await prisma.reviewStats.create({
      data: {
        templateId: input.templateId,
        userId: input.userId,
        accountId: input.accountId || null,
        marketplaceId: input.marketplaceId || null,
        productId: input.productId || null,
        asin: input.asin || null,
        sku: input.sku || null,
        sentCount: 1,
        reviewReceivedCount: input.reviewReceived ? 1 : 0,
        positiveReviews: input.reviewReceived && input.isPositive ? 1 : 0,
        negativeReviews: input.reviewReceived && !input.isPositive ? 1 : 0,
        responseTimes: input.reviewReceived && input.responseTimeHours !== undefined
          ? {
              min: input.responseTimeHours,
              max: input.responseTimeHours,
              average: input.responseTimeHours,
              count: 1,
            }
          : null,
      },
    })
  }

  logger.info('Review stats updated', {
    templateId: input.templateId,
    userId: input.userId,
    reviewReceived: input.reviewReceived,
  })
}

/**
 * Get review statistics
 */
export async function getReviewStats(
  userId: string,
  filters?: ReviewStatsFilters
): Promise<ReviewStatsResponse> {
  // Verify account access if provided
  if (filters?.accountId) {
    await verifyAccountAccess(userId, filters.accountId)
  }

  const where: any = {
    userId,
  }

  if (filters?.accountId) {
    where.accountId = filters.accountId
  }

  if (filters?.marketplaceId) {
    where.marketplaceId = filters.marketplaceId
  }

  if (filters?.templateId) {
    where.templateId = filters.templateId
  }

  if (filters?.productId) {
    where.productId = filters.productId
  }

  if (filters?.asin) {
    where.asin = filters.asin
  }

  if (filters?.sku) {
    where.sku = filters.sku
  }

  if (filters?.startDate || filters?.endDate) {
    where.lastUpdated = {}
    if (filters.startDate) {
      where.lastUpdated.gte = filters.startDate
    }
    if (filters.endDate) {
      where.lastUpdated.lte = filters.endDate
    }
  }

  const stats = await prisma.reviewStats.findMany({
    where,
    include: {
      template: {
        select: {
          id: true,
          name: true,
        },
      },
      product: {
        select: {
          id: true,
          title: true,
          sku: true,
        },
      },
    },
  })

  // Aggregate stats
  let totalSent = 0
  let totalReceived = 0
  let totalPositive = 0
  let totalNegative = 0
  let totalResponseTime = 0
  let responseTimeCount = 0

  const templateStats = new Map<string, {
    templateId: string
    templateName: string
    sent: number
    received: number
    positive: number
    negative: number
  }>()

  const productStats = new Map<string, {
    productId: string
    productTitle: string
    asin: string | null
    sku: string | null
    sent: number
    received: number
    positive: number
    negative: number
  }>()

  for (const stat of stats) {
    totalSent += stat.sentCount
    totalReceived += stat.reviewReceivedCount
    totalPositive += stat.positiveReviews
    totalNegative += stat.negativeReviews

    if (stat.responseTimes) {
      const times = stat.responseTimes as { average?: number; count?: number }
      if (times.average && times.count) {
        totalResponseTime += times.average * times.count
        responseTimeCount += times.count
      }
    }

    // Aggregate by template
    const templateId = stat.templateId
    if (!templateStats.has(templateId)) {
      templateStats.set(templateId, {
        templateId,
        templateName: stat.template?.name || 'Unknown',
        sent: 0,
        received: 0,
        positive: 0,
        negative: 0,
      })
    }

    const tStats = templateStats.get(templateId)!
    tStats.sent += stat.sentCount
    tStats.received += stat.reviewReceivedCount
    tStats.positive += stat.positiveReviews
    tStats.negative += stat.negativeReviews

    // Aggregate by product
    if (stat.productId) {
      const productKey = stat.productId
      if (!productStats.has(productKey)) {
        productStats.set(productKey, {
          productId: stat.productId!,
          productTitle: stat.product?.title || 'Unknown',
          asin: stat.asin,
          sku: stat.sku || stat.product?.sku || null,
          sent: 0,
          received: 0,
          positive: 0,
          negative: 0,
        })
      }

      const pStats = productStats.get(productKey)!
      pStats.sent += stat.sentCount
      pStats.received += stat.reviewReceivedCount
      pStats.positive += stat.positiveReviews
      pStats.negative += stat.negativeReviews
    }
  }

  const averageResponseTime = responseTimeCount > 0 ? totalResponseTime / responseTimeCount : 0
  const responseRate = totalSent > 0 ? (totalReceived / totalSent) * 100 : 0
  const positiveRate = totalReceived > 0 ? (totalPositive / totalReceived) * 100 : 0

  // Format template stats with rates
  const byTemplate = Array.from(templateStats.values()).map((stats) => ({
    ...stats,
    responseRate: stats.sent > 0 ? (stats.received / stats.sent) * 100 : 0,
    positiveRate: stats.received > 0 ? (stats.positive / stats.received) * 100 : 0,
  }))

  // Format product stats with rates
  const byProduct = Array.from(productStats.values()).map((stats) => ({
    ...stats,
    responseRate: stats.sent > 0 ? (stats.received / stats.sent) * 100 : 0,
    positiveRate: stats.received > 0 ? (stats.positive / stats.received) * 100 : 0,
  }))

  return {
    totalSent,
    totalReceived,
    totalPositive,
    totalNegative,
    averageResponseTime: Math.round(averageResponseTime * 100) / 100,
    responseRate: Math.round(responseRate * 100) / 100,
    positiveRate: Math.round(positiveRate * 100) / 100,
    byTemplate,
    byProduct,
  }
}

/**
 * Get review stats for a specific ASIN/product
 */
export async function getReviewStatsByProduct(
  userId: string,
  asin: string,
  filters?: Omit<ReviewStatsFilters, 'asin'>
): Promise<ReviewStatsResponse> {
  return getReviewStats(userId, { ...filters, asin })
}

