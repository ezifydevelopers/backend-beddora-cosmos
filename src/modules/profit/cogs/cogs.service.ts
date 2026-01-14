import prisma from '../../../config/db'
import { AppError } from '../../../middlewares/error.middleware'
import { Prisma } from '@prisma/client'

type CostMethod = 'BATCH' | 'TIME_PERIOD' | 'WEIGHTED_AVERAGE'

export interface CreateCogsInput {
  accountId: string
  marketplaceId: string
  sku: string
  quantity: number
  costMethod: CostMethod
  batchId?: string
  unitCost?: number
  shipmentCost?: number
  periodStart?: string
  periodEnd?: string
  asOf?: string
}

export interface UpdateCogsInput {
  marketplaceId?: string
  quantity?: number
  unitCost?: number
  shipmentCost?: number | null
}

function toDecimal(value: number): Prisma.Decimal {
  // Accepts JS number but stores as Decimal for DB safety.
  // Convert via string to avoid binary float artifacts in common cases.
  return new Prisma.Decimal(value.toString())
}

function computeTotalCost(quantity: number, unitCost: Prisma.Decimal, shipmentCost?: Prisma.Decimal | null): Prisma.Decimal {
  const base = unitCost.mul(quantity)
  return shipmentCost ? base.add(shipmentCost) : base
}

/**
 * Security: ensure user owns (or has access to) the given account.
 */
async function verifyAccountAccess(userId: string, accountId: string): Promise<void> {
  const userAccount = await prisma.userAccount.findFirst({
    where: { userId, accountId, isActive: true },
    select: { id: true },
  })

  if (!userAccount) {
    throw new AppError('Account not found or access denied', 403)
  }
}

/**
 * Security: ensure the marketplace is connected to the account.
 */
async function verifyMarketplaceForAccount(accountId: string, marketplaceId: string): Promise<void> {
  const link = await prisma.accountMarketplace.findFirst({
    where: { accountId, marketplaceId, isActive: true },
    select: { id: true },
  })
  if (!link) {
    throw new AppError('Marketplace not linked to account', 400)
  }
}

async function computeUnitCostFromBatch(accountId: string, sku: string, batchId: string): Promise<Prisma.Decimal> {
  const batch = await prisma.batch.findFirst({
    where: { id: batchId, accountId, sku },
    select: { unitCost: true },
  })
  if (!batch) {
    throw new AppError('Batch not found for sku/account', 404)
  }
  return batch.unitCost
}

async function computeUnitCostFromBatchesInPeriod(accountId: string, sku: string, start: Date, end: Date): Promise<Prisma.Decimal> {
  const batches = await prisma.batch.findMany({
    where: {
      accountId,
      sku,
      receivedAt: { gte: start, lte: end },
    },
    select: { quantity: true, totalCost: true },
  })
  const totalQty = batches.reduce((sum, b) => sum + b.quantity, 0)
  if (totalQty <= 0) {
    throw new AppError('No batches found for SKU in the provided period', 400)
  }
  const totalCost = batches.reduce((sum, b) => sum.add(b.totalCost), new Prisma.Decimal(0))
  return totalCost.div(totalQty)
}

async function computeWeightedAverageUnitCost(accountId: string, sku: string, asOf: Date): Promise<Prisma.Decimal> {
  const batches = await prisma.batch.findMany({
    where: {
      accountId,
      sku,
      receivedAt: { lte: asOf },
    },
    select: { quantity: true, totalCost: true },
  })
  const totalQty = batches.reduce((sum, b) => sum + b.quantity, 0)
  if (totalQty <= 0) {
    throw new AppError('No batches found for SKU to calculate weighted average', 400)
  }
  const totalCost = batches.reduce((sum, b) => sum.add(b.totalCost), new Prisma.Decimal(0))
  return totalCost.div(totalQty)
}

/**
 * Create a new COGS entry.
 *
 * Production notes:
 * - This creates a *historical* COGS snapshot for (sku, marketplace, account).
 * - Profit calculations can pick the latest snapshot at/under a reporting date.
 */
export async function createCogs(userId: string, input: CreateCogsInput) {
  await verifyAccountAccess(userId, input.accountId)
  await verifyMarketplaceForAccount(input.accountId, input.marketplaceId)

  const { accountId, marketplaceId, sku, quantity, costMethod, batchId } = input
  const shipmentCostDec = input.shipmentCost === undefined ? null : toDecimal(input.shipmentCost)

  // Allow explicit override if user provides unitCost, otherwise calculate based on method.
  let unitCostDec: Prisma.Decimal
  if (input.unitCost !== undefined) {
    unitCostDec = toDecimal(input.unitCost)
  } else if (costMethod === 'BATCH') {
    if (!batchId) throw new AppError('batchId is required for BATCH method', 400)
    unitCostDec = await computeUnitCostFromBatch(accountId, sku, batchId)
  } else if (costMethod === 'TIME_PERIOD') {
    const start = new Date(input.periodStart as string)
    const end = new Date(input.periodEnd as string)
    unitCostDec = await computeUnitCostFromBatchesInPeriod(accountId, sku, start, end)
  } else {
    const asOf = input.asOf ? new Date(input.asOf) : new Date()
    unitCostDec = await computeWeightedAverageUnitCost(accountId, sku, asOf)
  }

  const totalCostDec = computeTotalCost(quantity, unitCostDec, shipmentCostDec)

  // For BATCH method, prevent over-allocation against batch quantity.
  if (costMethod === 'BATCH' && batchId) {
    return await prisma.$transaction(async (tx) => {
      const batch = await tx.batch.findFirst({
        where: { id: batchId, accountId, sku },
        select: { id: true, quantity: true },
      })
      if (!batch) throw new AppError('Batch not found for sku/account', 404)

      const allocated = await tx.cOGS.aggregate({
        where: { batchId },
        _sum: { quantity: true },
      })
      const alreadyAllocated = allocated._sum.quantity || 0
      const remaining = batch.quantity - alreadyAllocated
      if (quantity > remaining) {
        throw new AppError(`Batch allocation exceeds remaining quantity. Remaining: ${remaining}`, 400)
      }

      return await tx.cOGS.create({
        data: {
          accountId,
          marketplaceId,
          sku,
          batchId,
          quantity,
          unitCost: unitCostDec,
          totalCost: totalCostDec,
          costMethod,
          shipmentCost: shipmentCostDec,
        },
      })
    })
  }

  return await prisma.cOGS.create({
    data: {
      accountId,
      marketplaceId,
      sku,
      batchId: batchId || null,
      quantity,
      unitCost: unitCostDec,
      totalCost: totalCostDec,
      costMethod,
      shipmentCost: shipmentCostDec,
    },
  })
}

/**
 * Get latest COGS snapshots for a SKU across marketplaces.
 */
export async function getCogsBySku(userId: string, accountId: string, sku: string) {
  await verifyAccountAccess(userId, accountId)

  const latest = await prisma.cOGS.findMany({
    where: { accountId, sku },
    orderBy: { createdAt: 'desc' },
    distinct: ['marketplaceId'],
    include: {
      marketplace: { select: { id: true, name: true, code: true } },
      batch: { select: { id: true, receivedAt: true } },
    },
  })

  return latest
}

/**
 * Get batch + related COGS allocations and computed remaining quantity.
 */
export async function getBatchCogsDetails(userId: string, batchId: string, accountId?: string) {
  if (accountId) {
    await verifyAccountAccess(userId, accountId)
  }

  const batch = await prisma.batch.findFirst({
    where: {
      id: batchId,
      ...(accountId ? { accountId } : {}),
    },
    include: {
      cogsEntries: {
        orderBy: { createdAt: 'desc' },
        include: { marketplace: { select: { id: true, name: true, code: true } } },
      },
    },
  })

  if (!batch) throw new AppError('Batch not found', 404)

  const allocatedQty = batch.cogsEntries.reduce((sum, c) => sum + c.quantity, 0)
  const remainingQty = batch.quantity - allocatedQty

  return {
    batch,
    allocatedQty,
    remainingQty,
  }
}

export async function getCogsHistory(
  userId: string,
  filters: {
    accountId: string
    sku?: string
    marketplaceId?: string
    startDate?: string
    endDate?: string
    costMethod?: CostMethod
    limit?: number
    offset?: number
  }
) {
  await verifyAccountAccess(userId, filters.accountId)

  const where: Prisma.COGSWhereInput = {
    accountId: filters.accountId,
    sku: filters.sku || undefined,
    marketplaceId: filters.marketplaceId || undefined,
    costMethod: filters.costMethod || undefined,
    createdAt:
      filters.startDate || filters.endDate
        ? {
            ...(filters.startDate ? { gte: new Date(filters.startDate) } : {}),
            ...(filters.endDate ? { lte: new Date(filters.endDate) } : {}),
          }
        : undefined,
  }

  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200)
  const offset = Math.max(filters.offset ?? 0, 0)

  const [rows, total] = await prisma.$transaction([
    prisma.cOGS.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
      include: {
        marketplace: { select: { id: true, name: true, code: true } },
        batch: { select: { id: true, receivedAt: true } },
      },
    }),
    prisma.cOGS.count({ where }),
  ])

  return { rows, total, limit, offset }
}

export async function updateCogs(userId: string, id: string, accountId: string, input: UpdateCogsInput) {
  await verifyAccountAccess(userId, accountId)

  const existing = await prisma.cOGS.findFirst({
    where: { id, accountId },
  })
  if (!existing) throw new AppError('COGS entry not found', 404)

  if (input.marketplaceId) {
    await verifyMarketplaceForAccount(accountId, input.marketplaceId)
  }

  const quantity = input.quantity ?? existing.quantity
  const unitCost = input.unitCost !== undefined ? toDecimal(input.unitCost) : existing.unitCost
  const shipmentCost =
    input.shipmentCost === undefined ? existing.shipmentCost : input.shipmentCost === null ? null : toDecimal(input.shipmentCost)

  const totalCost = computeTotalCost(quantity, unitCost, shipmentCost)

  // If linked to a batch, ensure quantity remains within available batch capacity.
  if (existing.batchId) {
    await prisma.$transaction(async (tx) => {
      const batch = await tx.batch.findFirst({
        where: { id: existing.batchId as string, accountId: existing.accountId, sku: existing.sku },
        select: { quantity: true },
      })
      if (!batch) throw new AppError('Linked batch not found', 400)

      const allocated = await tx.cOGS.aggregate({
        where: { batchId: existing.batchId },
        _sum: { quantity: true },
      })
      const alreadyAllocated = (allocated._sum.quantity || 0) - existing.quantity
      const remaining = batch.quantity - alreadyAllocated
      if (quantity > remaining) {
        throw new AppError(`Batch allocation exceeds remaining quantity. Remaining: ${remaining}`, 400)
      }

      await tx.cOGS.update({
        where: { id },
        data: {
          marketplaceId: input.marketplaceId || undefined,
          quantity,
          unitCost,
          shipmentCost,
          totalCost,
        },
      })
    })

    return await prisma.cOGS.findUnique({ where: { id } })
  }

  return await prisma.cOGS.update({
    where: { id },
    data: {
      marketplaceId: input.marketplaceId || undefined,
      quantity,
      unitCost,
      shipmentCost,
      totalCost,
    },
  })
}

