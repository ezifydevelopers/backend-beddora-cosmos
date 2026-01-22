/**
 * Scheduling Rule Evaluator
 * 
 * Evaluates scheduling rules against order data to determine
 * when emails should be queued and if conditions are met.
 */

import prisma from '../../../config/db'
import { SchedulingRuleConditions } from './schedulingRule.types'

export interface OrderData {
  orderId: string
  customerEmail: string
  orderDate: Date
  deliveryDate: Date | null
  orderStatus: string
  totalAmount: number
  isReturned: boolean
  isFirstTimeBuyer: boolean
  hasReview: boolean
  productId?: string | null
  sku?: string | null
  marketplaceId?: string | null
  accountId?: string | null
}

/**
 * Evaluate if order matches scheduling rule conditions
 */
export function evaluateRuleConditions(
  conditions: SchedulingRuleConditions | null,
  orderData: OrderData
): boolean {
  if (!conditions) {
    return true // No conditions means always match
  }

  // Check first-time buyer condition
  if (conditions.firstTimeBuyer !== undefined) {
    if (conditions.firstTimeBuyer && !orderData.isFirstTimeBuyer) {
      return false
    }
    if (!conditions.firstTimeBuyer && orderData.isFirstTimeBuyer) {
      return false
    }
  }

  // Check not returned condition
  if (conditions.notReturned !== undefined) {
    if (conditions.notReturned && orderData.isReturned) {
      return false
    }
    if (!conditions.notReturned && !orderData.isReturned) {
      return false
    }
  }

  // Check minimum order value
  if (conditions.minOrderValue !== undefined) {
    const minValue = conditions.minOrderValue / 100 // Convert from cents
    if (orderData.totalAmount < minValue) {
      return false
    }
  }

  // Check maximum order value
  if (conditions.maxOrderValue !== undefined) {
    const maxValue = conditions.maxOrderValue / 100 // Convert from cents
    if (orderData.totalAmount > maxValue) {
      return false
    }
  }

  // Check SKU filter
  if (conditions.skus && conditions.skus.length > 0) {
    if (!orderData.sku || !conditions.skus.includes(orderData.sku)) {
      return false
    }
  }

  // Check review conditions
  if (conditions.hasReview !== undefined) {
    if (conditions.hasReview && !orderData.hasReview) {
      return false
    }
    if (!conditions.hasReview && orderData.hasReview) {
      return false
    }
  }

  if (conditions.noReview !== undefined) {
    if (conditions.noReview && orderData.hasReview) {
      return false
    }
    if (!conditions.noReview && !orderData.hasReview) {
      return false
    }
  }

  // All conditions passed
  return true
}

/**
 * Calculate scheduled send date based on delivery date and delay
 */
export function calculateScheduledDate(
  deliveryDate: Date | null,
  deliveryDelayDays: number
): Date {
  if (!deliveryDate) {
    // If no delivery date, use order date + delay
    return new Date(Date.now() + deliveryDelayDays * 24 * 60 * 60 * 1000)
  }

  const scheduledDate = new Date(deliveryDate)
  scheduledDate.setDate(scheduledDate.getDate() + deliveryDelayDays)
  return scheduledDate
}

/**
 * Queue emails based on scheduling rules for a new order
 * This function should be called when an order is delivered
 */
export async function queueEmailsForOrder(orderData: OrderData): Promise<number> {
  const where: any = {
    isActive: true,
  }

  // Filter by account if provided
  if (orderData.accountId) {
    where.accountId = orderData.accountId
  }

  // Filter by marketplace if provided
  if (orderData.marketplaceId) {
    where.marketplaceId = orderData.marketplaceId
  }

  // Filter by product if provided
  if (orderData.productId) {
    where.productId = orderData.productId
  }

  // Filter by SKU if provided
  if (orderData.sku) {
    where.sku = orderData.sku
  }

  // Get all applicable scheduling rules
  const rules = await prisma.schedulingRule.findMany({
    where,
    include: {
      template: true,
    },
  })

  let queuedCount = 0

  for (const rule of rules) {
    // Evaluate conditions
    const conditions = (rule.conditions as SchedulingRuleConditions) || null
    const matches = evaluateRuleConditions(conditions, orderData)

    if (!matches) {
      continue // Skip this rule if conditions don't match
    }

    // Calculate scheduled send date
    const scheduledAt = calculateScheduledDate(
      orderData.deliveryDate,
      rule.deliveryDelayDays
    )

    // Check if email already queued for this order and template
    const existing = await prisma.emailQueue.findFirst({
      where: {
        templateId: rule.templateId,
        recipientEmail: orderData.customerEmail,
        eventKey: `order:${orderData.orderId}`,
      },
    })

    if (existing) {
      continue // Already queued
    }

    // Queue the email
    await prisma.emailQueue.create({
      data: {
        templateId: rule.templateId,
        recipientEmail: orderData.customerEmail,
        eventKey: `order:${orderData.orderId}`,
        scheduledAt,
        status: 'pending',
        payload: {
          orderId: orderData.orderId,
          orderDate: orderData.orderDate.toISOString(),
          deliveryDate: orderData.deliveryDate?.toISOString() || null,
          variables: {
            orderId: orderData.orderId,
            customerEmail: orderData.customerEmail,
            totalAmount: orderData.totalAmount,
          },
        },
      },
    })

    queuedCount++
  }

  return queuedCount
}

