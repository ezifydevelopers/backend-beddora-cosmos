/**
 * Reimbursement Case Service
 *
 * Generates reimbursement claim text and manages case lifecycle.
 */

import prisma from '../../../config/db'
import { AppError } from '../../../middlewares/error.middleware'
import { logger } from '../../../config/logger'
import {
  ReimbursementCaseInput,
  ReimbursementCaseUpdate,
  ReimbursementCaseFilters,
  CaseType,
} from './case.types'

async function verifyAccountAccess(userId: string, accountId?: string | null): Promise<void> {
  if (!accountId) return
  const userAccount = await prisma.userAccount.findFirst({
    where: { userId, accountId, isActive: true },
  })
  if (!userAccount) {
    throw new AppError('Account not found or access denied', 403)
  }
}

function buildCaseText(params: {
  caseType: CaseType
  marketplace: string
  sku?: string | null
  quantity?: number
  cost?: number
  orderId?: string
  reasonCode?: string | null
  unreimbursedAmount?: number
  notes?: string
}): string {
  const lines: string[] = []
  lines.push(`Case Type: ${params.caseType.replace('_', ' ')}`)
  lines.push(`Marketplace: ${params.marketplace}`)
  if (params.orderId) lines.push(`Order ID: ${params.orderId}`)
  if (params.sku) lines.push(`SKU: ${params.sku}`)
  if (params.quantity !== undefined) lines.push(`Quantity: ${params.quantity}`)
  if (params.cost !== undefined) lines.push(`Unit Cost: $${params.cost}`)
  if (params.reasonCode) lines.push(`Reason Code: ${params.reasonCode}`)
  if (params.unreimbursedAmount !== undefined)
    lines.push(`Unreimbursed Amount: $${params.unreimbursedAmount}`)
  if (params.notes) lines.push(`Notes: ${params.notes}`)
  lines.push('')
  lines.push('Please investigate and reimburse the missing amount as per Amazon policy.')
  return lines.join('\n')
}

export async function getCases(userId: string, filters?: ReimbursementCaseFilters) {
  if (filters?.accountId) {
    await verifyAccountAccess(userId, filters.accountId)
  }

  const where: any = { userId }
  if (filters?.accountId) where.accountId = filters.accountId
  if (filters?.marketplaceId) where.marketplaceId = filters.marketplaceId
  if (filters?.productId) where.productId = filters.productId
  if (filters?.sku) where.sku = filters.sku
  if (filters?.caseType) where.caseType = filters.caseType
  if (filters?.submissionStatus) where.submissionStatus = filters.submissionStatus
  if (filters?.startDate || filters?.endDate) {
    where.createdAt = {}
    if (filters.startDate) where.createdAt.gte = filters.startDate
    if (filters.endDate) where.createdAt.lte = filters.endDate
  }

  return prisma.reimbursementCase.findMany({
    where,
    include: {
      marketplace: { select: { id: true, name: true } },
      product: { select: { id: true, title: true, sku: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
}

export async function getCaseById(userId: string, caseId: string) {
  const found = await prisma.reimbursementCase.findFirst({
    where: { id: caseId, userId },
    include: {
      marketplace: { select: { id: true, name: true } },
      product: { select: { id: true, title: true, sku: true } },
    },
  })
  if (!found) throw new AppError('Case not found', 404)
  return found
}

export async function createCase(userId: string, input: ReimbursementCaseInput) {
  const marketplace = await prisma.marketplace.findFirst({
    where: { id: input.marketplaceId, isActive: true },
  })
  if (!marketplace) throw new AppError('Marketplace not found', 404)

  let sourceSku: string | null = input.sku || null
  let quantity: number | undefined
  let cost: number | undefined
  let reasonCode: string | null = null
  let unreimbursedAmount: number | undefined

  if (input.productId) {
    const product = await prisma.product.findFirst({
      where: { id: input.productId },
      select: { sku: true, cost: true },
    })
    if (product) {
      sourceSku = sourceSku || product.sku
      cost = Number(product.cost)
    }
  }

  if (input.caseType === 'lost' || input.caseType === 'damaged') {
    if (input.sourceId) {
      const alert = await prisma.fbaInventoryAlert.findFirst({
        where: { id: input.sourceId, userId },
      })
      if (alert) {
        quantity = alert.reportedQuantity
        sourceSku = sourceSku || alert.sku
        unreimbursedAmount = Number(alert.estimatedAmount)
      }
    }
  }

  if (input.caseType === 'refund_discrepancy' && input.sourceId) {
    const discrepancy = await prisma.refundDiscrepancy.findFirst({
      where: { id: input.sourceId, userId },
    })
    if (discrepancy) {
      quantity = discrepancy.refundQuantity
      sourceSku = sourceSku || discrepancy.sku
      reasonCode = discrepancy.refundReasonCode
      unreimbursedAmount = Number(discrepancy.unreimbursedAmount)
    }
  }

  const generatedText = buildCaseText({
    caseType: input.caseType,
    marketplace: marketplace.name,
    sku: sourceSku,
    quantity,
    cost,
    reasonCode,
    unreimbursedAmount,
    notes: input.customNotes,
  })

  const created = await prisma.reimbursementCase.create({
    data: {
      userId,
      accountId: null,
      marketplaceId: input.marketplaceId,
      productId: input.productId || null,
      sku: sourceSku,
      caseType: input.caseType,
      generatedText,
      submissionStatus: 'draft',
    },
  })

  await prisma.caseHistory.create({
    data: {
      caseId: created.id,
      userId,
      previousText: null,
      newText: generatedText,
      previousStatus: null,
      newStatus: 'draft',
      notes: 'Case generated',
    },
  })

  logger.info('Reimbursement case created', { caseId: created.id, userId })
  return created
}

export async function updateCase(
  userId: string,
  caseId: string,
  update: ReimbursementCaseUpdate
) {
  const existing = await prisma.reimbursementCase.findFirst({
    where: { id: caseId, userId },
  })
  if (!existing) throw new AppError('Case not found', 404)

  const updateData: any = {}
  if (update.generatedText !== undefined) updateData.generatedText = update.generatedText
  if (update.submissionStatus !== undefined) updateData.submissionStatus = update.submissionStatus
  if (update.submissionDate !== undefined) updateData.submissionDate = update.submissionDate
  if (update.resolutionDate !== undefined) updateData.resolutionDate = update.resolutionDate

  const updated = await prisma.reimbursementCase.update({
    where: { id: caseId },
    data: updateData,
  })

  await prisma.caseHistory.create({
    data: {
      caseId: caseId,
      userId,
      previousText: existing.generatedText,
      newText: update.generatedText ?? existing.generatedText,
      previousStatus: existing.submissionStatus,
      newStatus: update.submissionStatus ?? existing.submissionStatus,
      notes: update.notes || null,
    },
  })

  return updated
}

export function getSellerSupportUrl(): string {
  return 'https://sellercentral.amazon.com/cu/help/contact-us'
}

