import prisma from '../../../config/db'
import { AppError } from '../../../middlewares/error.middleware'
import {
  InventoryForecastAlert,
  InventoryForecastAlertsResponse,
  InventoryForecastFilters,
  InventoryForecastItem,
  InventoryForecastResponse,
} from '../../../types/inventory-forecast.types'

const SALES_LOOKBACK_DAYS = 30

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

function computeSuggestedReorder(forecast30: number, threshold: number): number {
  const delta = threshold - forecast30
  return delta > 0 ? Math.ceil(delta) : 0
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
        orderDate: {
          gte: startDate,
        },
      },
      sku: sku || undefined,
    },
    select: {
      sku: true,
      quantity: true,
    },
  })

  const returns = await prisma.return.groupBy({
    by: ['sku'],
    where: {
      accountId,
      marketplaceId: marketplaceId || undefined,
      createdAt: {
        gte: startDate,
      },
      sku: sku || undefined,
    },
    _sum: {
      quantityReturned: true,
    },
  })

  const returnMap = new Map<string, number>()
  for (const entry of returns) {
    returnMap.set(entry.sku, entry._sum.quantityReturned || 0)
  }

  const velocityMap = new Map<string, number>()
  for (const item of orderItems) {
    const current = velocityMap.get(item.sku) || 0
    velocityMap.set(item.sku, current + item.quantity)
  }

  for (const [skuKey, units] of velocityMap.entries()) {
    const returned = returnMap.get(skuKey) || 0
    const netUnits = Math.max(units - returned, 0)
    velocityMap.set(skuKey, netUnits / SALES_LOOKBACK_DAYS)
  }

  return velocityMap
}

function mapForecastItem(record: any): InventoryForecastItem {
  const suggestedReorderQty = computeSuggestedReorder(
    Number(record.forecast30Day),
    record.restockThreshold
  )

  return {
    id: record.id,
    sku: record.sku,
    accountId: record.accountId,
    marketplaceId: record.marketplaceId,
    marketplace: record.marketplace
      ? {
          id: record.marketplace.id,
          name: record.marketplace.name,
          code: record.marketplace.code,
        }
      : null,
    currentStock: record.currentStock,
    salesVelocity: Number(record.salesVelocity),
    forecast3Day: Number(record.forecast3Day),
    forecast7Day: Number(record.forecast7Day),
    forecast30Day: Number(record.forecast30Day),
    restockThreshold: record.restockThreshold,
    alertSent: record.alertSent,
    lastCalculatedAt: record.lastCalculatedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    suggestedReorderQty,
  }
}

async function recalculateForecasts(filters: InventoryForecastFilters): Promise<InventoryForecastItem[]> {
  const { accountId, marketplaceId, sku } = filters

  const stockRecords = await prisma.inventoryStock.findMany({
    where: {
      accountId,
      marketplaceId: marketplaceId || undefined,
      sku: sku || undefined,
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

  const velocityMap = await getSalesVelocity(accountId, marketplaceId, sku)

  const results: InventoryForecastItem[] = []

  for (const stock of stockRecords) {
    const velocity = velocityMap.get(stock.sku) || 0
    const forecast3 = stock.quantityAvailable - velocity * 3
    const forecast7 = stock.quantityAvailable - velocity * 7
    const forecast30 = stock.quantityAvailable - velocity * 30

    const record = await prisma.inventoryForecast.upsert({
      where: {
        accountId_sku_marketplaceId: {
          accountId,
          sku: stock.sku,
          marketplaceId: stock.marketplaceId,
        },
      },
      update: {
        currentStock: stock.quantityAvailable,
        salesVelocity: velocity,
        forecast3Day: forecast3,
        forecast7Day: forecast7,
        forecast30Day: forecast30,
        lastCalculatedAt: new Date(),
      },
      create: {
        accountId,
        marketplaceId: stock.marketplaceId,
        sku: stock.sku,
        currentStock: stock.quantityAvailable,
        salesVelocity: velocity,
        forecast3Day: forecast3,
        forecast7Day: forecast7,
        forecast30Day: forecast30,
        restockThreshold: stock.lowStockThreshold,
        lastCalculatedAt: new Date(),
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

    results.push(mapForecastItem(record))
  }

  return results
}

export async function getForecasts(
  userId: string,
  filters: InventoryForecastFilters
): Promise<InventoryForecastResponse> {
  const { accountId } = filters

  if (!accountId) {
    throw new AppError('accountId is required', 400)
  }

  await verifyAccountAccess(userId, accountId)

  const data = await recalculateForecasts(filters)

  return {
    data,
    total: data.length,
  }
}

export async function getForecastBySKU(
  userId: string,
  sku: string,
  filters: InventoryForecastFilters
): Promise<InventoryForecastResponse> {
  return getForecasts(userId, { ...filters, sku })
}

export async function updateForecast(
  userId: string,
  sku: string,
  payload: {
    accountId: string
    marketplaceId?: string
    restockThreshold?: number
  }
): Promise<InventoryForecastItem> {
  const { accountId, marketplaceId, restockThreshold } = payload

  if (!accountId) {
    throw new AppError('accountId is required', 400)
  }

  await verifyAccountAccess(userId, accountId)

  const existing = await prisma.inventoryForecast.findFirst({
    where: {
      accountId,
      sku,
      marketplaceId: marketplaceId || undefined,
    },
    include: {
      marketplace: {
        select: { id: true, name: true, code: true },
      },
    },
  })

  if (!existing) {
    throw new AppError('Forecast not found for SKU', 404)
  }

  const updated = await prisma.inventoryForecast.update({
    where: { id: existing.id },
    data: {
      restockThreshold: typeof restockThreshold === 'number' ? restockThreshold : existing.restockThreshold,
    },
    include: {
      marketplace: {
        select: { id: true, name: true, code: true },
      },
    },
  })

  return mapForecastItem(updated)
}

export async function getRestockAlerts(
  userId: string,
  filters: InventoryForecastFilters
): Promise<InventoryForecastAlertsResponse> {
  const { accountId } = filters

  if (!accountId) {
    throw new AppError('accountId is required', 400)
  }

  await verifyAccountAccess(userId, accountId)

  const forecasts = await recalculateForecasts(filters)

  const alerts: InventoryForecastAlert[] = []

  for (const forecast of forecasts) {
    if (forecast.forecast7Day <= forecast.restockThreshold) {
      alerts.push({
        sku: forecast.sku,
        marketplaceId: forecast.marketplaceId || null,
        marketplace: forecast.marketplace || null,
        currentStock: forecast.currentStock,
        forecast7Day: forecast.forecast7Day,
        forecast30Day: forecast.forecast30Day,
        restockThreshold: forecast.restockThreshold,
        suggestedReorderQty: forecast.suggestedReorderQty,
      })

      if (!forecast.alertSent) {
        await prisma.inventoryForecast.update({
          where: { id: forecast.id },
          data: { alertSent: true },
        })

        await prisma.alert.create({
          data: {
            accountId,
            type: 'inventory.restock',
            severity: 'warning',
            title: 'Restock alert',
            message: `${forecast.sku} is projected to fall below threshold in 7 days.`,
            metadata: {
              sku: forecast.sku,
              marketplaceId: forecast.marketplaceId,
              forecast7Day: forecast.forecast7Day,
              restockThreshold: forecast.restockThreshold,
            },
          },
        })
      }
    }
  }

  return {
    alerts,
    total: alerts.length,
  }
}

