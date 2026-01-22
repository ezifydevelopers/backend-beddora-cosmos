/**
 * FBA Inventory Alert Service
 * 
 * Business logic for detecting and managing FBA lost and damaged inventory alerts.
 * Handles detection, calculation, resolution, and integration with reimbursements workflow.
 */

import prisma from '../../../config/db'
import { AppError } from '../../../middlewares/error.middleware'
import { logger } from '../../../config/logger'
import {
  FbaInventoryAlertInput,
  FbaInventoryAlertUpdate,
  FbaInventoryAlertFilters,
  FbaInventoryAlertResponse,
  CalculateEstimatedAmountParams,
  FbaAlertStatus,
} from './fbaInventory.types'

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
 * Calculate estimated reimbursement amount for lost/damaged inventory
 * Based on item cost (COGS), fees, and lost sales
 */
export async function calculateEstimatedAmount(
  params: CalculateEstimatedAmountParams
): Promise<number> {
  let cost = params.cost || 0

  // If product ID or SKU provided, fetch cost from product
  if (!cost && (params.productId || params.sku)) {
    const product = await prisma.product.findFirst({
      where: {
        ...(params.productId ? { id: params.productId } : {}),
        ...(params.sku ? { sku: params.sku } : {}),
      },
      select: {
        cost: true,
        currentPrice: true,
      },
    })

    if (product) {
      cost = Number(product.cost)
    }
  }

  // Calculate base amount (cost * quantity)
  const baseAmount = cost * params.quantity

  // Add estimated fees (FBA fees, referral fees, etc.)
  // For lost inventory, we estimate 15% of selling price as fees
  // For damaged inventory, we estimate 10% of selling price as fees
  const feePercentage = params.alertType === 'lost' ? 0.15 : 0.10
  const estimatedFees = params.fees || baseAmount * feePercentage

  // Total estimated amount
  const estimatedAmount = baseAmount + estimatedFees

  return Math.round(estimatedAmount * 100) / 100 // Round to 2 decimal places
}

/**
 * Create a new FBA inventory alert
 * This is typically called when discrepancies are detected from Amazon API or reports
 */
export async function createFbaInventoryAlert(
  userId: string,
  input: FbaInventoryAlertInput
): Promise<FbaInventoryAlert> {
  // Verify marketplace exists
  const marketplace = await prisma.marketplace.findFirst({
    where: {
      id: input.marketplaceId,
      isActive: true,
    },
  })

  if (!marketplace) {
    throw new AppError('Marketplace not found', 404)
  }

  // Verify product exists if provided
  if (input.productId) {
    const product = await prisma.product.findFirst({
      where: {
        id: input.productId,
      },
    })

    if (!product) {
      throw new AppError('Product not found', 404)
    }
  }

  // Calculate estimated amount if not provided
  let estimatedAmount = input.estimatedAmount
  if (!estimatedAmount || estimatedAmount === 0) {
    estimatedAmount = await calculateEstimatedAmount({
      productId: input.productId,
      sku: input.sku,
      quantity: input.reportedQuantity,
      alertType: input.alertType,
    })
  }

  const alert = await prisma.fbaInventoryAlert.create({
    data: {
      userId,
      accountId: null, // Can be set based on product's accountId
      marketplaceId: input.marketplaceId,
      productId: input.productId || null,
      sku: input.sku || null,
      alertType: input.alertType,
      reportedQuantity: input.reportedQuantity,
      reimbursedQuantity: input.reimbursedQuantity || 0,
      estimatedAmount,
      status: 'pending',
      notes: input.notes || null,
    },
    include: {
      marketplace: {
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
          cost: true,
        },
      },
    },
  })

  logger.info('FBA inventory alert created', {
    alertId: alert.id,
    userId,
    alertType: input.alertType,
    quantity: input.reportedQuantity,
  })

  return {
    id: alert.id,
    userId: alert.userId,
    accountId: alert.accountId,
    marketplaceId: alert.marketplaceId,
    productId: alert.productId,
    sku: alert.sku,
    alertType: alert.alertType as any,
    reportedQuantity: alert.reportedQuantity,
    reimbursedQuantity: alert.reimbursedQuantity,
    estimatedAmount: Number(alert.estimatedAmount),
    status: alert.status as any,
    notes: alert.notes,
    detectedAt: alert.detectedAt,
    resolvedAt: alert.resolvedAt,
    createdAt: alert.createdAt,
    updatedAt: alert.updatedAt,
    marketplace: alert.marketplace
      ? {
          id: alert.marketplace.id,
          name: alert.marketplace.name,
        }
      : undefined,
    product: alert.product
      ? {
          id: alert.product.id,
          title: alert.product.title,
          sku: alert.product.sku,
          cost: Number(alert.product.cost),
        }
      : undefined,
  }
}

/**
 * Get all FBA inventory alerts with filters
 */
export async function getFbaInventoryAlerts(
  userId: string,
  filters?: FbaInventoryAlertFilters
): Promise<FbaInventoryAlertResponse> {
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

  if (filters?.productId) {
    where.productId = filters.productId
  }

  if (filters?.sku) {
    where.sku = filters.sku
  }

  if (filters?.alertType) {
    where.alertType = filters.alertType
  }

  if (filters?.status) {
    where.status = filters.status
  }

  if (filters?.startDate || filters?.endDate) {
    where.detectedAt = {}
    if (filters.startDate) {
      where.detectedAt.gte = filters.startDate
    }
    if (filters.endDate) {
      where.detectedAt.lte = filters.endDate
    }
  }

  const alerts = await prisma.fbaInventoryAlert.findMany({
    where,
    include: {
      marketplace: {
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
          cost: true,
        },
      },
    },
    orderBy: {
      detectedAt: 'desc',
    },
  })

  // Calculate summary
  let totalPending = 0
  let totalReimbursed = 0
  let totalIgnored = 0
  let totalDisputed = 0
  let totalEstimatedAmount = 0
  let totalReimbursedAmount = 0

  for (const alert of alerts) {
    const amount = Number(alert.estimatedAmount)
    totalEstimatedAmount += amount

    if (alert.status === 'pending') {
      totalPending++
    } else if (alert.status === 'reimbursed') {
      totalReimbursed++
      totalReimbursedAmount += Number(alert.reimbursedQuantity) * (amount / alert.reportedQuantity)
    } else if (alert.status === 'ignored') {
      totalIgnored++
    } else if (alert.status === 'disputed') {
      totalDisputed++
    }
  }

  return {
    alerts: alerts.map((alert) => ({
      id: alert.id,
      userId: alert.userId,
      accountId: alert.accountId,
      marketplaceId: alert.marketplaceId,
      productId: alert.productId,
      sku: alert.sku,
      alertType: alert.alertType as any,
      reportedQuantity: alert.reportedQuantity,
      reimbursedQuantity: alert.reimbursedQuantity,
      estimatedAmount: Number(alert.estimatedAmount),
      status: alert.status as any,
      notes: alert.notes,
      detectedAt: alert.detectedAt,
      resolvedAt: alert.resolvedAt,
      createdAt: alert.createdAt,
      updatedAt: alert.updatedAt,
      marketplace: alert.marketplace
        ? {
            id: alert.marketplace.id,
            name: alert.marketplace.name,
          }
        : undefined,
      product: alert.product
        ? {
            id: alert.product.id,
            title: alert.product.title,
            sku: alert.product.sku,
            cost: Number(alert.product.cost),
          }
        : undefined,
    })),
    summary: {
      totalPending,
      totalReimbursed,
      totalIgnored,
      totalDisputed,
      totalEstimatedAmount: Math.round(totalEstimatedAmount * 100) / 100,
      totalReimbursedAmount: Math.round(totalReimbursedAmount * 100) / 100,
    },
  }
}

/**
 * Get FBA inventory alerts for a specific marketplace
 */
export async function getFbaInventoryAlertsByMarketplace(
  userId: string,
  marketplaceId: string,
  filters?: Omit<FbaInventoryAlertFilters, 'marketplaceId'>
): Promise<FbaInventoryAlertResponse> {
  return getFbaInventoryAlerts(userId, { ...filters, marketplaceId })
}

/**
 * Get a single FBA inventory alert by ID
 */
export async function getFbaInventoryAlertById(
  userId: string,
  alertId: string
): Promise<FbaInventoryAlert> {
  const alert = await prisma.fbaInventoryAlert.findFirst({
    where: {
      id: alertId,
      userId,
    },
    include: {
      marketplace: {
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
          cost: true,
        },
      },
    },
  })

  if (!alert) {
    throw new AppError('FBA inventory alert not found', 404)
  }

  return {
    id: alert.id,
    userId: alert.userId,
    accountId: alert.accountId,
    marketplaceId: alert.marketplaceId,
    productId: alert.productId,
    sku: alert.sku,
    alertType: alert.alertType as any,
    reportedQuantity: alert.reportedQuantity,
    reimbursedQuantity: alert.reimbursedQuantity,
    estimatedAmount: Number(alert.estimatedAmount),
    status: alert.status as any,
    notes: alert.notes,
    detectedAt: alert.detectedAt,
    resolvedAt: alert.resolvedAt,
    createdAt: alert.createdAt,
    updatedAt: alert.updatedAt,
    marketplace: alert.marketplace
      ? {
          id: alert.marketplace.id,
          name: alert.marketplace.name,
        }
      : undefined,
    product: alert.product
      ? {
          id: alert.product.id,
          title: alert.product.title,
          sku: alert.product.sku,
          cost: Number(alert.product.cost),
        }
      : undefined,
  }
}

/**
 * Resolve an FBA inventory alert (mark as reimbursed, ignored, or disputed)
 */
export async function resolveFbaInventoryAlert(
  userId: string,
  alertId: string,
  update: FbaInventoryAlertUpdate
): Promise<FbaInventoryAlert> {
  // Verify alert exists and belongs to user
  const existing = await prisma.fbaInventoryAlert.findFirst({
    where: {
      id: alertId,
      userId,
    },
  })

  if (!existing) {
    throw new AppError('FBA inventory alert not found', 404)
  }

  const updateData: any = {}

  if (update.status !== undefined) {
    updateData.status = update.status
    // Set resolvedAt if status is not pending
    if (update.status !== 'pending' && !existing.resolvedAt) {
      updateData.resolvedAt = new Date()
    }
  }

  if (update.reimbursedQuantity !== undefined) {
    updateData.reimbursedQuantity = update.reimbursedQuantity
  }

  if (update.notes !== undefined) {
    updateData.notes = update.notes
  }

  const alert = await prisma.fbaInventoryAlert.update({
    where: { id: alertId },
    data: updateData,
    include: {
      marketplace: {
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
          cost: true,
        },
      },
    },
  })

  logger.info('FBA inventory alert resolved', {
    alertId: alert.id,
    userId,
    status: update.status,
  })

  // If marked as reimbursed, optionally create a reimbursement record
  if (update.status === 'reimbursed') {
    // Integration with reimbursements workflow can be added here
    // For now, we just log it
    logger.info('FBA inventory alert marked as reimbursed - reimbursement record can be created', {
      alertId: alert.id,
      amount: Number(alert.estimatedAmount),
    })
  }

  return {
    id: alert.id,
    userId: alert.userId,
    accountId: alert.accountId,
    marketplaceId: alert.marketplaceId,
    productId: alert.productId,
    sku: alert.sku,
    alertType: alert.alertType as any,
    reportedQuantity: alert.reportedQuantity,
    reimbursedQuantity: alert.reimbursedQuantity,
    estimatedAmount: Number(alert.estimatedAmount),
    status: alert.status as any,
    notes: alert.notes,
    detectedAt: alert.detectedAt,
    resolvedAt: alert.resolvedAt,
    createdAt: alert.createdAt,
    updatedAt: alert.updatedAt,
    marketplace: alert.marketplace
      ? {
          id: alert.marketplace.id,
          name: alert.marketplace.name,
        }
      : undefined,
    product: alert.product
      ? {
          id: alert.product.id,
          title: alert.product.title,
          sku: alert.product.sku,
          cost: Number(alert.product.cost),
        }
      : undefined,
  }
}

/**
 * Detect FBA inventory discrepancies
 * This function should be called periodically (via cron job) to check for lost/damaged inventory
 * It compares current inventory levels with expected levels and creates alerts for discrepancies
 */
export async function detectFbaInventoryDiscrepancies(
  userId: string,
  accountId: string,
  marketplaceId: string
): Promise<{ detected: number; alerts: FbaInventoryAlert[] }> {
  // This is a placeholder implementation
  // In production, this would:
  // 1. Fetch current FBA inventory from Amazon API
  // 2. Compare with expected inventory from our database
  // 3. Check Amazon's lost/damaged inventory reports
  // 4. Create alerts for discrepancies

  logger.info('FBA inventory discrepancy detection started', {
    userId,
    accountId,
    marketplaceId,
  })

  // TODO: Implement actual detection logic
  // For now, return empty result
  return {
    detected: 0,
    alerts: [],
  }
}

