import prisma from '../../../config/db'
import { AppError } from '../../../middlewares/error.middleware'
import {
  POAlertResponse,
  PurchaseOrderFilters,
  PurchaseOrderListResponse,
  PurchaseOrderPayload,
  PurchaseOrderResponse,
  PurchaseOrderUpdatePayload,
} from '../../../types/purchase-orders.types'

async function verifyAccountAccess(userId: string, accountId: string): Promise<void> {
  const userAccount = await prisma.userAccount.findFirst({
    where: { userId, accountId, isActive: true },
  })
  if (!userAccount) {
    throw new AppError('Account not found or access denied', 403)
  }
}

function mapPurchaseOrder(po: any): PurchaseOrderResponse {
  return {
    id: po.id,
    accountId: po.accountId,
    supplierId: po.supplierId,
    marketplaceId: po.marketplaceId,
    poNumber: po.poNumber,
    status: po.status,
    estimatedDeliveryDate: po.estimatedDeliveryDate,
    totalQuantity: po.totalQuantity,
    totalCost: Number(po.totalCost),
    orderDate: po.orderDate,
    receivedDate: po.receivedDate,
    supplier: po.supplier
      ? {
          id: po.supplier.id,
          name: po.supplier.name,
          leadTimeDays: po.supplier.leadTimeDays,
        }
      : undefined,
    marketplace: po.marketplace
      ? {
          id: po.marketplace.id,
          name: po.marketplace.name,
          code: po.marketplace.code,
        }
      : null,
    items: po.items?.map((item: any) => ({
      id: item.id,
      sku: item.sku,
      quantity: item.quantity,
      unitCost: Number(item.unitCost),
      totalCost: Number(item.totalCost),
    })),
  }
}

async function resolveProductId(accountId: string, sku: string): Promise<string | undefined> {
  const product = await prisma.product.findFirst({
    where: { accountId, sku },
    select: { id: true },
  })
  return product?.id
}

export async function listPurchaseOrders(
  userId: string,
  filters: PurchaseOrderFilters
): Promise<PurchaseOrderListResponse> {
  const { accountId, supplierId, marketplaceId, status, sku } = filters

  if (!accountId) {
    throw new AppError('accountId is required', 400)
  }

  await verifyAccountAccess(userId, accountId)

  const where: any = {
    accountId,
    supplierId: supplierId || undefined,
    marketplaceId: marketplaceId || undefined,
    status: status || undefined,
  }

  if (sku) {
    where.items = {
      some: {
        sku,
      },
    }
  }

  const purchaseOrders = await prisma.purchaseOrder.findMany({
    where,
    include: {
      supplier: true,
      marketplace: true,
      items: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  return {
    data: purchaseOrders.map(mapPurchaseOrder),
    total: purchaseOrders.length,
  }
}

export async function getPurchaseOrderById(
  userId: string,
  id: string,
  accountId: string
): Promise<PurchaseOrderResponse> {
  if (!accountId) {
    throw new AppError('accountId is required', 400)
  }

  await verifyAccountAccess(userId, accountId)

  const purchaseOrder = await prisma.purchaseOrder.findFirst({
    where: { id, accountId },
    include: {
      supplier: true,
      marketplace: true,
      items: true,
      inboundShipments: true,
    },
  })

  if (!purchaseOrder) {
    throw new AppError('Purchase order not found', 404)
  }

  return mapPurchaseOrder(purchaseOrder)
}

export async function createPurchaseOrder(
  userId: string,
  payload: PurchaseOrderPayload
): Promise<PurchaseOrderResponse> {
  const { accountId, supplierId, marketplaceId, poNumber, estimatedDeliveryDate, items } = payload

  if (!accountId || !supplierId || !poNumber || !items?.length) {
    throw new AppError('accountId, supplierId, poNumber, and items are required', 400)
  }

  await verifyAccountAccess(userId, accountId)

  const supplier = await prisma.supplier.findFirst({ where: { id: supplierId } })
  if (!supplier) {
    throw new AppError('Supplier not found', 404)
  }

  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0)
  const totalCost = items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0)

  const orderDate = new Date()
  const autoEstimatedDate =
    estimatedDeliveryDate ||
    new Date(orderDate.getTime() + supplier.leadTimeDays * 24 * 60 * 60 * 1000).toISOString()

  const createItems = []
  for (const item of items) {
    const productId = item.productId || (await resolveProductId(accountId, item.sku))
    createItems.push({
      sku: item.sku,
      quantity: item.quantity,
      unitCost: item.unitCost,
      totalCost: item.quantity * item.unitCost,
      productId: productId || null,
    })
  }

  const purchaseOrder = await prisma.purchaseOrder.create({
    data: {
      accountId,
      supplierId,
      marketplaceId: marketplaceId || null,
      poNumber,
      status: 'pending',
      estimatedDeliveryDate: autoEstimatedDate ? new Date(autoEstimatedDate) : null,
      totalQuantity,
      totalCost,
      orderDate,
      items: {
        create: createItems,
      },
    },
    include: {
      supplier: true,
      marketplace: true,
      items: true,
    },
  })

  return mapPurchaseOrder(purchaseOrder)
}

export async function updatePurchaseOrder(
  userId: string,
  id: string,
  payload: PurchaseOrderUpdatePayload
): Promise<PurchaseOrderResponse> {
  const { accountId, supplierId, marketplaceId, status, estimatedDeliveryDate } = payload

  if (!accountId) {
    throw new AppError('accountId is required', 400)
  }

  await verifyAccountAccess(userId, accountId)

  const existing = await prisma.purchaseOrder.findFirst({ where: { id, accountId } })
  if (!existing) {
    throw new AppError('Purchase order not found', 404)
  }

  const updated = await prisma.purchaseOrder.update({
    where: { id: existing.id },
    data: {
      supplierId: supplierId || undefined,
      marketplaceId: marketplaceId || undefined,
      status: status || undefined,
      estimatedDeliveryDate: estimatedDeliveryDate ? new Date(estimatedDeliveryDate) : undefined,
    },
    include: {
      supplier: true,
      marketplace: true,
      items: true,
    },
  })

  return mapPurchaseOrder(updated)
}

export async function cancelPurchaseOrder(
  userId: string,
  id: string,
  accountId: string
): Promise<void> {
  if (!accountId) {
    throw new AppError('accountId is required', 400)
  }

  await verifyAccountAccess(userId, accountId)

  const existing = await prisma.purchaseOrder.findFirst({ where: { id, accountId } })
  if (!existing) {
    throw new AppError('Purchase order not found', 404)
  }

  await prisma.purchaseOrder.update({
    where: { id: existing.id },
    data: { status: 'canceled' },
  })
}

export async function duplicatePurchaseOrder(
  userId: string,
  id: string,
  accountId: string,
  poNumber: string
): Promise<PurchaseOrderResponse> {
  if (!accountId || !poNumber) {
    throw new AppError('accountId and poNumber are required', 400)
  }

  await verifyAccountAccess(userId, accountId)

  const existing = await prisma.purchaseOrder.findFirst({
    where: { id, accountId },
    include: { items: true, supplier: true, marketplace: true },
  })

  if (!existing) {
    throw new AppError('Purchase order not found', 404)
  }

  const newOrder = await prisma.purchaseOrder.create({
    data: {
      accountId: existing.accountId,
      supplierId: existing.supplierId,
      marketplaceId: existing.marketplaceId,
      poNumber,
      status: 'pending',
      estimatedDeliveryDate: existing.estimatedDeliveryDate,
      totalQuantity: existing.totalQuantity,
      totalCost: existing.totalCost,
      items: {
        create: existing.items.map((item) => ({
          sku: item.sku,
          quantity: item.quantity,
          unitCost: item.unitCost,
          totalCost: item.totalCost,
          productId: item.productId,
        })),
      },
    },
    include: {
      supplier: true,
      marketplace: true,
      items: true,
    },
  })

  return mapPurchaseOrder(newOrder)
}

export async function getPurchaseOrderAlerts(
  userId: string,
  filters: PurchaseOrderFilters
): Promise<POAlertResponse> {
  const { accountId } = filters
  if (!accountId) {
    throw new AppError('accountId is required', 400)
  }
  await verifyAccountAccess(userId, accountId)

  const now = new Date()
  const upcomingWindow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  const purchaseOrders = await prisma.purchaseOrder.findMany({
    where: {
      accountId,
      status: { in: ['pending', 'in-transit'] },
    },
    include: {
      supplier: true,
      marketplace: true,
      items: true,
    },
  })

  const delayed: PurchaseOrderResponse[] = []
  const upcoming: PurchaseOrderResponse[] = []

  for (const po of purchaseOrders) {
    if (po.estimatedDeliveryDate && po.estimatedDeliveryDate < now) {
      delayed.push(mapPurchaseOrder(po))

      const existingAlert = await prisma.alert.findFirst({
        where: {
          accountId,
          type: 'po.delayed',
          metadata: {
            path: ['poId'],
            equals: po.id,
          },
        },
      })

      if (!existingAlert) {
        await prisma.alert.create({
          data: {
            accountId,
            type: 'po.delayed',
            severity: 'warning',
            title: 'Delayed purchase order',
            message: `PO ${po.poNumber} is past its estimated delivery date.`,
            metadata: {
              poId: po.id,
              poNumber: po.poNumber,
            },
          },
        })
      }
    } else if (po.estimatedDeliveryDate && po.estimatedDeliveryDate <= upcomingWindow) {
      upcoming.push(mapPurchaseOrder(po))
    }
  }

  return { delayed, upcoming }
}

