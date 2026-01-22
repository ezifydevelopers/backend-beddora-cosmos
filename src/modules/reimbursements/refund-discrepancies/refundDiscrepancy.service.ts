/**
 * Refund Discrepancy Service
 *
 * Business logic for detecting and managing refund discrepancies.
 * Handles detection, calculation, resolution, and integration with reimbursements workflow.
 */

import prisma from '../../../config/db'
import { AppError } from '../../../middlewares/error.middleware'
import { logger } from '../../../config/logger'
import {
  RefundDiscrepancyInput,
  RefundDiscrepancyUpdate,
  RefundDiscrepancyFilters,
  RefundDiscrepancyResponse,
  RefundDiscrepancyStatus,
} from './refundDiscrepancy.types'

async function verifyAccountAccess(userId: string, accountId?: string | null): Promise<void> {
  if (!accountId) return
  const userAccount = await prisma.userAccount.findFirst({
    where: { userId, accountId, isActive: true },
  })
  if (!userAccount) {
    throw new AppError('Account not found or access denied', 403)
  }
}

async function calculateUnreimbursedAmount(
  productId: string | null | undefined,
  sku: string | null | undefined,
  refundQuantity: number,
  returnedQuantity: number
): Promise<number> {
  const discrepancyQty = Math.max(refundQuantity - returnedQuantity, 0)
  if (discrepancyQty === 0) return 0

  const product = await prisma.product.findFirst({
    where: {
      ...(productId ? { id: productId } : {}),
      ...(sku ? { sku } : {}),
    },
    select: {
      cost: true,
    },
  })
  const unitCost = product ? Number(product.cost) : 0
  const amount = unitCost * discrepancyQty
  return Math.round(amount * 100) / 100
}

export async function createRefundDiscrepancy(
  userId: string,
  input: RefundDiscrepancyInput
) {
  const marketplace = await prisma.marketplace.findFirst({
    where: { id: input.marketplaceId, isActive: true },
  })
  if (!marketplace) {
    throw new AppError('Marketplace not found', 404)
  }

  if (input.productId) {
    const product = await prisma.product.findFirst({
      where: { id: input.productId },
    })
    if (!product) {
      throw new AppError('Product not found', 404)
    }
  }

  const unreimbursedAmount =
    input.unreimbursedAmount !== undefined
      ? input.unreimbursedAmount
      : await calculateUnreimbursedAmount(
          input.productId,
          input.sku,
          input.refundQuantity,
          input.returnedQuantity
        )

  const discrepancy = await prisma.refundDiscrepancy.create({
    data: {
      userId,
      accountId: null,
      marketplaceId: input.marketplaceId,
      productId: input.productId || null,
      sku: input.sku || null,
      refundQuantity: input.refundQuantity,
      returnedQuantity: input.returnedQuantity,
      unreimbursedAmount,
      refundReasonCode: input.refundReasonCode || null,
      status: 'pending',
    },
    include: {
      marketplace: { select: { id: true, name: true } },
      product: { select: { id: true, title: true, sku: true, cost: true } },
    },
  })

  logger.info('Refund discrepancy created', {
    discrepancyId: discrepancy.id,
    userId,
    marketplaceId: input.marketplaceId,
  })

  return discrepancy
}

export async function getRefundDiscrepancies(
  userId: string,
  filters?: RefundDiscrepancyFilters
): Promise<RefundDiscrepancyResponse> {
  if (filters?.accountId) {
    await verifyAccountAccess(userId, filters.accountId)
  }

  const where: any = { userId }
  if (filters?.accountId) where.accountId = filters.accountId
  if (filters?.marketplaceId) where.marketplaceId = filters.marketplaceId
  if (filters?.productId) where.productId = filters.productId
  if (filters?.sku) where.sku = filters.sku
  if (filters?.refundReasonCode) where.refundReasonCode = filters.refundReasonCode
  if (filters?.status) where.status = filters.status
  if (filters?.startDate || filters?.endDate) {
    where.detectedAt = {}
    if (filters.startDate) where.detectedAt.gte = filters.startDate
    if (filters.endDate) where.detectedAt.lte = filters.endDate
  }

  const discrepancies = await prisma.refundDiscrepancy.findMany({
    where,
    include: {
      marketplace: { select: { id: true, name: true } },
      product: { select: { id: true, title: true, sku: true, cost: true } },
    },
    orderBy: { detectedAt: 'desc' },
  })

  let totalPending = 0
  let totalReconciled = 0
  let totalIgnored = 0
  let totalUnreimbursedAmount = 0

  for (const discrepancy of discrepancies) {
    totalUnreimbursedAmount += Number(discrepancy.unreimbursedAmount)
    if (discrepancy.status === 'pending') totalPending++
    if (discrepancy.status === 'reconciled') totalReconciled++
    if (discrepancy.status === 'ignored') totalIgnored++
  }

  return {
    discrepancies: discrepancies.map((d) => ({
      ...d,
      unreimbursedAmount: Number(d.unreimbursedAmount),
      marketplace: d.marketplace
        ? { id: d.marketplace.id, name: d.marketplace.name }
        : undefined,
      product: d.product
        ? {
            id: d.product.id,
            title: d.product.title,
            sku: d.product.sku,
            cost: Number(d.product.cost),
          }
        : undefined,
    })),
    summary: {
      totalPending,
      totalReconciled,
      totalIgnored,
      totalUnreimbursedAmount: Math.round(totalUnreimbursedAmount * 100) / 100,
    },
  }
}

export async function getRefundDiscrepanciesByMarketplace(
  userId: string,
  marketplaceId: string,
  filters?: Omit<RefundDiscrepancyFilters, 'marketplaceId'>
) {
  return getRefundDiscrepancies(userId, { ...filters, marketplaceId })
}

export async function reconcileRefundDiscrepancy(
  userId: string,
  discrepancyId: string,
  update: RefundDiscrepancyUpdate
) {
  const existing = await prisma.refundDiscrepancy.findFirst({
    where: { id: discrepancyId, userId },
  })
  if (!existing) {
    throw new AppError('Refund discrepancy not found', 404)
  }

  const nextStatus = update.status || existing.status
  const updateData: any = {}
  if (update.status) updateData.status = update.status
  if (update.notes !== undefined) updateData.notes = update.notes
  if (update.status && update.status !== 'pending') {
    updateData.resolvedAt = new Date()
  }

  const discrepancy = await prisma.refundDiscrepancy.update({
    where: { id: discrepancyId },
    data: updateData,
  })

  await prisma.refundDiscrepancyHistory.create({
    data: {
      discrepancyId,
      userId,
      previousStatus: existing.status,
      newStatus: nextStatus,
      notes: update.notes || null,
    },
  })

  logger.info('Refund discrepancy reconciled', {
    discrepancyId,
    userId,
    status: nextStatus,
  })

  return discrepancy
}

export async function detectRefundDiscrepancies(
  userId: string,
  accountId: string,
  marketplaceId: string
): Promise<{ detected: number }> {
  await verifyAccountAccess(userId, accountId)

  // Placeholder for detection logic:
  // 1. Fetch refund data (Amazon API or internal refunds)
  // 2. Compare refundQuantity vs returnedQuantity
  // 3. Create RefundDiscrepancy entries for mismatches
  logger.info('Refund discrepancy detection started', { userId, accountId, marketplaceId })

  return { detected: 0 }
}

