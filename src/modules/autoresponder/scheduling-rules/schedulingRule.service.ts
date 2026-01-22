/**
 * Scheduling Rule Service
 * 
 * Business logic for managing email automation scheduling rules.
 * Handles CRUD operations, validation, and rule evaluation.
 */

import prisma from '../../../config/db'
import { AppError } from '../../../middlewares/error.middleware'
import { logger } from '../../../config/logger'
import {
  SchedulingRuleInput,
  SchedulingRuleUpdate,
  SchedulingRuleResponse,
  SchedulingPreview,
} from './schedulingRule.types'

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
 * Verify that the template belongs to the user
 */
async function verifyTemplateAccess(userId: string, templateId: string): Promise<void> {
  const template = await prisma.emailTemplate.findFirst({
    where: {
      id: templateId,
      userId,
    },
  })

  if (!template) {
    throw new AppError('Email template not found or access denied', 404)
  }
}

/**
 * Get all scheduling rules for a user
 * Optionally filter by account, marketplace, template, or active status
 */
export async function getSchedulingRules(
  userId: string,
  filters?: {
    accountId?: string
    marketplaceId?: string
    templateId?: string
    isActive?: boolean
  }
): Promise<SchedulingRuleResponse[]> {
  // Verify account access if accountId is provided
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

  if (filters?.isActive !== undefined) {
    where.isActive = filters.isActive
  }

  const rules = await prisma.schedulingRule.findMany({
    where,
    include: {
      template: {
        select: {
          id: true,
          name: true,
          subject: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  })

  return rules.map((rule) => ({
    id: rule.id,
    templateId: rule.templateId,
    userId: rule.userId,
    accountId: rule.accountId,
    marketplaceId: rule.marketplaceId,
    productId: rule.productId,
    sku: rule.sku,
    deliveryDelayDays: rule.deliveryDelayDays,
    conditions: (rule.conditions as any) || null,
    isActive: rule.isActive,
    createdAt: rule.createdAt,
    updatedAt: rule.updatedAt,
    template: rule.template
      ? {
          id: rule.template.id,
          name: rule.template.name,
          subject: rule.template.subject,
        }
      : undefined,
  }))
}

/**
 * Get a single scheduling rule by ID
 */
export async function getSchedulingRuleById(
  userId: string,
  ruleId: string
): Promise<SchedulingRuleResponse> {
  const rule = await prisma.schedulingRule.findFirst({
    where: {
      id: ruleId,
      userId,
    },
    include: {
      template: {
        select: {
          id: true,
          name: true,
          subject: true,
        },
      },
    },
  })

  if (!rule) {
    throw new AppError('Scheduling rule not found', 404)
  }

  return {
    id: rule.id,
    templateId: rule.templateId,
    userId: rule.userId,
    accountId: rule.accountId,
    marketplaceId: rule.marketplaceId,
    productId: rule.productId,
    sku: rule.sku,
    deliveryDelayDays: rule.deliveryDelayDays,
    conditions: (rule.conditions as any) || null,
    isActive: rule.isActive,
    createdAt: rule.createdAt,
    updatedAt: rule.updatedAt,
    template: rule.template
      ? {
          id: rule.template.id,
          name: rule.template.name,
          subject: rule.template.subject,
        }
      : undefined,
  }
}

/**
 * Create a new scheduling rule
 */
export async function createSchedulingRule(
  userId: string,
  data: SchedulingRuleInput
): Promise<SchedulingRuleResponse> {
  // Verify template access
  await verifyTemplateAccess(userId, data.templateId)

  // Verify account access if provided
  if (data.accountId) {
    await verifyAccountAccess(userId, data.accountId)
  }

  // Verify marketplace exists if provided
  if (data.marketplaceId) {
    const marketplace = await prisma.marketplace.findFirst({
      where: {
        id: data.marketplaceId,
        isActive: true,
      },
    })

    if (!marketplace) {
      throw new AppError('Marketplace not found', 404)
    }
  }

  // Verify product exists if provided
  if (data.productId) {
    const product = await prisma.product.findFirst({
      where: {
        id: data.productId,
        accountId: data.accountId || undefined,
      },
    })

    if (!product) {
      throw new AppError('Product not found', 404)
    }
  }

  const rule = await prisma.schedulingRule.create({
    data: {
      templateId: data.templateId,
      userId,
      accountId: data.accountId || null,
      marketplaceId: data.marketplaceId || null,
      productId: data.productId || null,
      sku: data.sku || null,
      deliveryDelayDays: data.deliveryDelayDays,
      conditions: data.conditions || null,
      isActive: data.isActive ?? true,
    },
    include: {
      template: {
        select: {
          id: true,
          name: true,
          subject: true,
        },
      },
    },
  })

  logger.info('Scheduling rule created', {
    ruleId: rule.id,
    userId,
    templateId: data.templateId,
  })

  return {
    id: rule.id,
    templateId: rule.templateId,
    userId: rule.userId,
    accountId: rule.accountId,
    marketplaceId: rule.marketplaceId,
    productId: rule.productId,
    sku: rule.sku,
    deliveryDelayDays: rule.deliveryDelayDays,
    conditions: (rule.conditions as any) || null,
    isActive: rule.isActive,
    createdAt: rule.createdAt,
    updatedAt: rule.updatedAt,
    template: rule.template
      ? {
          id: rule.template.id,
          name: rule.template.name,
          subject: rule.template.subject,
        }
      : undefined,
  }
}

/**
 * Update an existing scheduling rule
 */
export async function updateSchedulingRule(
  userId: string,
  ruleId: string,
  data: SchedulingRuleUpdate
): Promise<SchedulingRuleResponse> {
  // Verify rule exists and belongs to user
  const existingRule = await prisma.schedulingRule.findFirst({
    where: {
      id: ruleId,
      userId,
    },
  })

  if (!existingRule) {
    throw new AppError('Scheduling rule not found', 404)
  }

  // Verify template access if templateId is being updated
  if (data.templateId && data.templateId !== existingRule.templateId) {
    await verifyTemplateAccess(userId, data.templateId)
  }

  // Verify account access if accountId is being updated
  if (data.accountId !== undefined && data.accountId !== existingRule.accountId) {
    await verifyAccountAccess(userId, data.accountId)
  }

  // Verify marketplace exists if provided
  if (data.marketplaceId !== undefined && data.marketplaceId !== null) {
    const marketplace = await prisma.marketplace.findFirst({
      where: {
        id: data.marketplaceId,
        isActive: true,
      },
    })

    if (!marketplace) {
      throw new AppError('Marketplace not found', 404)
    }
  }

  // Verify product exists if provided
  if (data.productId !== undefined && data.productId !== null) {
    const product = await prisma.product.findFirst({
      where: {
        id: data.productId,
        accountId: data.accountId || existingRule.accountId || undefined,
      },
    })

    if (!product) {
      throw new AppError('Product not found', 404)
    }
  }

  const updateData: any = {}

  if (data.templateId !== undefined) updateData.templateId = data.templateId
  if (data.accountId !== undefined) updateData.accountId = data.accountId
  if (data.marketplaceId !== undefined) updateData.marketplaceId = data.marketplaceId
  if (data.productId !== undefined) updateData.productId = data.productId
  if (data.sku !== undefined) updateData.sku = data.sku
  if (data.deliveryDelayDays !== undefined) updateData.deliveryDelayDays = data.deliveryDelayDays
  if (data.conditions !== undefined) updateData.conditions = data.conditions
  if (data.isActive !== undefined) updateData.isActive = data.isActive

  const rule = await prisma.schedulingRule.update({
    where: { id: ruleId },
    data: updateData,
    include: {
      template: {
        select: {
          id: true,
          name: true,
          subject: true,
        },
      },
    },
  })

  logger.info('Scheduling rule updated', {
    ruleId: rule.id,
    userId,
  })

  return {
    id: rule.id,
    templateId: rule.templateId,
    userId: rule.userId,
    accountId: rule.accountId,
    marketplaceId: rule.marketplaceId,
    productId: rule.productId,
    sku: rule.sku,
    deliveryDelayDays: rule.deliveryDelayDays,
    conditions: (rule.conditions as any) || null,
    isActive: rule.isActive,
    createdAt: rule.createdAt,
    updatedAt: rule.updatedAt,
    template: rule.template
      ? {
          id: rule.template.id,
          name: rule.template.name,
          subject: rule.template.subject,
        }
      : undefined,
  }
}

/**
 * Delete a scheduling rule
 */
export async function deleteSchedulingRule(userId: string, ruleId: string): Promise<void> {
  const rule = await prisma.schedulingRule.findFirst({
    where: {
      id: ruleId,
      userId,
    },
  })

  if (!rule) {
    throw new AppError('Scheduling rule not found', 404)
  }

  await prisma.schedulingRule.delete({
    where: { id: ruleId },
  })

  logger.info('Scheduling rule deleted', {
    ruleId,
    userId,
  })
}

/**
 * Get preview of scheduled emails based on rules
 * This helps users understand when emails will be sent before activating rules
 */
export async function getSchedulingPreview(
  userId: string,
  filters?: {
    accountId?: string
    templateId?: string
  }
): Promise<SchedulingPreview[]> {
  const where: any = {
    userId,
    isActive: true,
  }

  if (filters?.accountId) {
    where.accountId = filters.accountId
    await verifyAccountAccess(userId, filters.accountId)
  }

  if (filters?.templateId) {
    where.templateId = filters.templateId
  }

  const rules = await prisma.schedulingRule.findMany({
    where,
    include: {
      template: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  })

  const previews: SchedulingPreview[] = []

  for (const rule of rules) {
    // Calculate estimated send date (delivery date + delay days)
    // For preview, we use a sample delivery date (today)
    const sampleDeliveryDate = new Date()
    const estimatedSendDate = new Date(sampleDeliveryDate)
    estimatedSendDate.setDate(estimatedSendDate.getDate() + rule.deliveryDelayDays)

    // Count applicable orders (simplified - in production, this would query actual orders)
    // This is a placeholder - actual implementation would check order conditions
    const applicableOrders = 0 // TODO: Implement actual order matching logic

    previews.push({
      ruleId: rule.id,
      ruleName: `Rule for ${rule.template?.name || 'Template'}`,
      templateName: rule.template?.name || 'Unknown',
      estimatedSendDate,
      conditions: (rule.conditions as any) || null,
      applicableOrders,
    })
  }

  return previews
}

