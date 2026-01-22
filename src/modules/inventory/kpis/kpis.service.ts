import prisma from '../../../config/db'
import { AppError } from '../../../middlewares/error.middleware'
import {
  FifoBatchAssignment,
  InventoryKpiFilters,
  InventoryKpiItem,
  InventoryKpiResponse,
  StockStatus,
} from '../../../types/inventory-kpis.types'

const SALES_LOOKBACK_DAYS = 30
const OVERSTOCK_DAYS_THRESHOLD = 90

async function verifyAccountAccess(userId: string, accountId: string): Promise<void> {
  const userAccount = await prisma.userAccount.findFirst({
    where: { userId, accountId, isActive: true },
  })
  if (!userAccount) {
    throw new AppError('Account not found or access denied', 403)
  }
}

async function getSalesVelocity(
  accountId: string,
  marketplaceId?: string,
  sku?: string
): Promise<Map<string, number>> {
  const startDate = new Date(Date.now() - SALES_LOOKBACK_DAYS * 24 * 60 * 60 * 1000)

  const orderItems = await prisma.orderItem.findMany({
    where: {
      order: {
        accountId,
        marketplaceId: marketplaceId || undefined,
        orderDate: { gte: startDate },
      },
      sku: sku || undefined,
    },
    select: { sku: true, quantity: true },
  })

  const returns = await prisma.return.groupBy({
    by: ['sku'],
    where: {
      accountId,
      marketplaceId: marketplaceId || undefined,
      createdAt: { gte: startDate },
      sku: sku || undefined,
    },
    _sum: { quantityReturned: true },
  })

  const returnMap = new Map<string, number>()
  for (const entry of returns) {
    returnMap.set(entry.sku, entry._sum.quantityReturned || 0)
  }

  const velocityMap = new Map<string, number>()
  for (const item of orderItems) {
    velocityMap.set(item.sku, (velocityMap.get(item.sku) || 0) + item.quantity)
  }

  for (const [skuKey, units] of velocityMap.entries()) {
    const returned = returnMap.get(skuKey) || 0
    const netUnits = Math.max(units - returned, 0)
    velocityMap.set(skuKey, netUnits / SALES_LOOKBACK_DAYS)
  }

  return velocityMap
}

function calculateDaysOfStockLeft(currentStock: number, velocity: number): number {
  if (velocity <= 0) return currentStock > 0 ? OVERSTOCK_DAYS_THRESHOLD : 0
  return Number((currentStock / velocity).toFixed(2))
}

function buildFifoAssignments(
  currentStock: number,
  batches: Array<{ id: string; quantity: number; receivedAt: Date }>
): FifoBatchAssignment[] {
  let remaining = currentStock
  const assignments: FifoBatchAssignment[] = []

  for (const batch of batches) {
    if (remaining <= 0) break
    const assigned = Math.min(batch.quantity, remaining)
    assignments.push({
      batchId: batch.id,
      receivedAt: batch.receivedAt,
      quantityAssigned: assigned,
    })
    remaining -= assigned
  }

  return assignments
}

function getStatus(daysOfStockLeft: number, overstockRisk: boolean): StockStatus {
  if (overstockRisk) return 'overstock'
  if (daysOfStockLeft <= 7) return 'low'
  return 'normal'
}

async function recalculateKPIs(filters: InventoryKpiFilters): Promise<InventoryKpiItem[]> {
  const { accountId, marketplaceId, sku } = filters

  const stockRecords = await prisma.inventoryStock.findMany({
    where: {
      accountId,
      marketplaceId: marketplaceId || undefined,
      sku: sku || undefined,
    },
    include: {
      marketplace: {
        select: { id: true, name: true, code: true },
      },
    },
  })

  const velocityMap = await getSalesVelocity(accountId, marketplaceId, sku)

  const results: InventoryKpiItem[] = []

  for (const stock of stockRecords) {
    const velocity = velocityMap.get(stock.sku) || 0
    const daysLeft = calculateDaysOfStockLeft(stock.quantityAvailable, velocity)
    const overstockRisk = daysLeft >= OVERSTOCK_DAYS_THRESHOLD && stock.quantityAvailable > 0

    const batches = await prisma.batch.findMany({
      where: { accountId, sku: stock.sku },
      orderBy: { receivedAt: 'asc' },
      select: { id: true, quantity: true, receivedAt: true },
    })

    const fifoAssignments = buildFifoAssignments(stock.quantityAvailable, batches)

    const record = await prisma.inventoryKPI.upsert({
      where: {
        accountId_sku_marketplaceId: {
          accountId,
          sku: stock.sku,
          marketplaceId: stock.marketplaceId,
        },
      },
      update: {
        daysOfStockLeft: daysLeft,
        overstockRisk,
        fifoBatchAssignments: fifoAssignments,
        lastCalculatedAt: new Date(),
      },
      create: {
        accountId,
        marketplaceId: stock.marketplaceId,
        sku: stock.sku,
        daysOfStockLeft: daysLeft,
        overstockRisk,
        fifoBatchAssignments: fifoAssignments,
        lastCalculatedAt: new Date(),
      },
      include: {
        marketplace: { select: { id: true, name: true, code: true } },
      },
    })

    results.push({
      id: record.id,
      sku: record.sku,
      accountId: record.accountId,
      marketplaceId: record.marketplaceId,
      marketplace: record.marketplace
        ? { id: record.marketplace.id, name: record.marketplace.name, code: record.marketplace.code }
        : null,
      daysOfStockLeft: Number(record.daysOfStockLeft),
      overstockRisk: record.overstockRisk,
      fifoBatchAssignments: (record.fifoBatchAssignments as FifoBatchAssignment[]) || [],
      lastCalculatedAt: record.lastCalculatedAt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      status: getStatus(Number(record.daysOfStockLeft), record.overstockRisk),
    })
  }

  return results
}

export async function getInventoryKpis(
  userId: string,
  filters: InventoryKpiFilters
): Promise<InventoryKpiResponse> {
  if (!filters.accountId) {
    throw new AppError('accountId is required', 400)
  }

  await verifyAccountAccess(userId, filters.accountId)

  const data = await recalculateKPIs(filters)

  const filtered = filters.status
    ? data.filter((item) => item.status === filters.status)
    : data

  return { data: filtered, total: filtered.length }
}

export async function getInventoryKpiBySKU(
  userId: string,
  sku: string,
  filters: InventoryKpiFilters
): Promise<InventoryKpiResponse> {
  return getInventoryKpis(userId, { ...filters, sku })
}

export async function recalculateInventoryKpis(
  userId: string,
  filters: InventoryKpiFilters
): Promise<InventoryKpiResponse> {
  return getInventoryKpis(userId, filters)
}

