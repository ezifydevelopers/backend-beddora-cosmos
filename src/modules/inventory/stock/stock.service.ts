import prisma from '../../../config/db'
import { AppError } from '../../../middlewares/error.middleware'
import {
  InventoryStockAlertsResponse,
  InventoryStockFilters,
  InventoryStockItem,
  InventoryStockResponse,
  InventoryStockSummary,
  StockStatus,
} from '../../../types/inventory-stock.types'

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

async function verifyAccountAccess(userId: string, accountId: string): Promise<void> {
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

function getStockStatus(quantityAvailable: number, lowStockThreshold: number): StockStatus {
  if (quantityAvailable <= 0) return 'out_of_stock'
  if (quantityAvailable <= lowStockThreshold) return 'low'
  return 'normal'
}

function mapInventoryItem(item: any): InventoryStockItem {
  return {
    id: item.id,
    sku: item.sku,
    accountId: item.accountId,
    marketplaceId: item.marketplaceId,
    marketplace: item.marketplace
      ? {
          id: item.marketplace.id,
          name: item.marketplace.name,
          code: item.marketplace.code,
        }
      : null,
    quantityAvailable: item.quantityAvailable,
    quantityReserved: item.quantityReserved,
    lowStockThreshold: item.lowStockThreshold,
    lastSyncedAt: item.lastSyncedAt,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    status: getStockStatus(item.quantityAvailable, item.lowStockThreshold),
  }
}

function buildSummary(items: InventoryStockItem[], pendingShipments?: number): InventoryStockSummary {
  const summaryMap = new Map<string | null, InventoryStockSummary['marketplaceSummary'][number]>()

  let totalStock = 0
  let totalReserved = 0
  let lowStockCount = 0
  let outOfStockCount = 0

  for (const item of items) {
    totalStock += item.quantityAvailable
    totalReserved += item.quantityReserved

    if (item.status === 'low') lowStockCount += 1
    if (item.status === 'out_of_stock') outOfStockCount += 1

    const key = item.marketplaceId || null
    if (!summaryMap.has(key)) {
      summaryMap.set(key, {
        marketplaceId: item.marketplaceId || null,
        marketplaceName: item.marketplace?.name || null,
        marketplaceCode: item.marketplace?.code || null,
        totalStock: 0,
        lowStockCount: 0,
        outOfStockCount: 0,
      })
    }

    const current = summaryMap.get(key)!
    current.totalStock += item.quantityAvailable
    if (item.status === 'low') current.lowStockCount += 1
    if (item.status === 'out_of_stock') current.outOfStockCount += 1
  }

  return {
    totalStock,
    totalReserved,
    lowStockCount,
    outOfStockCount,
    marketplaceSummary: Array.from(summaryMap.values()),
    pendingShipments,
  }
}

async function getPendingShipments(accountId: string): Promise<number> {
  const aggregation = await prisma.purchaseOrderItem.aggregate({
    where: {
      purchaseOrder: {
        accountId,
        status: {
          not: 'received',
        },
      },
    },
    _sum: {
      quantity: true,
    },
  })

  return Number(aggregation._sum.quantity || 0)
}

export async function getInventory(userId: string, filters: InventoryStockFilters): Promise<InventoryStockResponse> {
  const {
    accountId,
    marketplaceId,
    sku,
    status,
    page = 1,
    limit = DEFAULT_LIMIT,
    includePendingShipments,
  } = filters

  if (!accountId) {
    throw new AppError('accountId is required', 400)
  }

  await verifyAccountAccess(userId, accountId)

  const where: any = {
    accountId,
    marketplaceId: marketplaceId || undefined,
  }

  if (sku) {
    where.sku = {
      contains: sku,
      mode: 'insensitive',
    }
  }

  if (status === 'out_of_stock') {
    where.quantityAvailable = { lte: 0 }
  }

  const rawItems = await prisma.inventoryStock.findMany({
    where,
    orderBy: [{ sku: 'asc' }, { marketplaceId: 'asc' }],
    include: {
      marketplace: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
    },
  })

  // Note: Low/normal status relies on row-level thresholds. For large datasets,
  // consider a computed column or raw SQL with column comparisons.
  let mappedItems = rawItems.map(mapInventoryItem)

  if (status === 'low') {
    mappedItems = mappedItems.filter(
      (item) => item.quantityAvailable > 0 && item.quantityAvailable <= item.lowStockThreshold
    )
  } else if (status === 'normal') {
    mappedItems = mappedItems.filter((item) => item.quantityAvailable > item.lowStockThreshold)
  }

  const safeLimit = Math.min(Math.max(limit, 1), MAX_LIMIT)
  const safePage = Math.max(page, 1)
  const start = (safePage - 1) * safeLimit
  const pagedItems = mappedItems.slice(start, start + safeLimit)

  const pendingShipments = includePendingShipments ? await getPendingShipments(accountId) : undefined
  const summary = buildSummary(mappedItems, pendingShipments)

  return {
    data: pagedItems,
    summary,
    total: mappedItems.length,
    page: safePage,
    limit: safeLimit,
  }
}

export async function getInventoryBySKU(
  userId: string,
  sku: string,
  filters: Pick<InventoryStockFilters, 'accountId' | 'marketplaceId'>
): Promise<InventoryStockResponse> {
  const { accountId, marketplaceId } = filters

  if (!accountId) {
    throw new AppError('accountId is required', 400)
  }

  await verifyAccountAccess(userId, accountId)

  const where: any = {
    accountId,
    sku,
    marketplaceId: marketplaceId || undefined,
  }

  const rawItems = await prisma.inventoryStock.findMany({
    where,
    orderBy: [{ marketplaceId: 'asc' }],
    include: {
      marketplace: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
    },
  })

  const mappedItems = rawItems.map(mapInventoryItem)
  const summary = buildSummary(mappedItems)

  return {
    data: mappedItems,
    summary,
    total: mappedItems.length,
    page: 1,
    limit: mappedItems.length,
  }
}

export async function updateInventory(
  userId: string,
  sku: string,
  data: {
    accountId: string
    marketplaceId: string
    amazonAccountId?: string
    quantityAvailable?: number
    quantityReserved?: number
    lowStockThreshold?: number
  }
): Promise<InventoryStockItem> {
  const {
    accountId,
    marketplaceId,
    amazonAccountId,
    quantityAvailable,
    quantityReserved,
    lowStockThreshold,
  } = data

  if (!accountId || !marketplaceId) {
    throw new AppError('accountId and marketplaceId are required', 400)
  }

  await verifyAccountAccess(userId, accountId)

  const updated = await prisma.inventoryStock.upsert({
    where: {
      accountId_sku_marketplaceId: {
        accountId,
        sku,
        marketplaceId,
      },
    },
    update: {
      amazonAccountId: amazonAccountId || undefined,
      quantityAvailable: typeof quantityAvailable === 'number' ? quantityAvailable : undefined,
      quantityReserved: typeof quantityReserved === 'number' ? quantityReserved : undefined,
      lowStockThreshold: typeof lowStockThreshold === 'number' ? lowStockThreshold : undefined,
      lastSyncedAt: new Date(),
    },
    create: {
      accountId,
      marketplaceId,
      amazonAccountId: amazonAccountId || null,
      sku,
      quantityAvailable: quantityAvailable ?? 0,
      quantityReserved: quantityReserved ?? 0,
      lowStockThreshold: lowStockThreshold ?? 10,
      lastSyncedAt: new Date(),
    },
    include: {
      marketplace: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
    },
  })

  return mapInventoryItem(updated)
}

export async function getLowStockAlerts(
  userId: string,
  filters: Pick<InventoryStockFilters, 'accountId' | 'marketplaceId' | 'sku'>
): Promise<InventoryStockAlertsResponse> {
  const { accountId, marketplaceId, sku } = filters

  if (!accountId) {
    throw new AppError('accountId is required', 400)
  }

  await verifyAccountAccess(userId, accountId)

  const where: any = {
    accountId,
    marketplaceId: marketplaceId || undefined,
  }

  if (sku) {
    where.sku = {
      contains: sku,
      mode: 'insensitive',
    }
  }

  const rawItems = await prisma.inventoryStock.findMany({
    where,
    orderBy: [{ quantityAvailable: 'asc' }],
    include: {
      marketplace: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
    },
  })

  const alerts = rawItems
    .map(mapInventoryItem)
    .filter((item) => item.quantityAvailable <= item.lowStockThreshold)
    .map((item) => ({
      sku: item.sku,
      marketplaceId: item.marketplaceId || null,
      marketplace: item.marketplace || null,
      quantityAvailable: item.quantityAvailable,
      lowStockThreshold: item.lowStockThreshold,
      status: item.status,
    }))

  return {
    alerts,
    total: alerts.length,
  }
}

