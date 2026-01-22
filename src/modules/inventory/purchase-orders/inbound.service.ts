import prisma from '../../../config/db'
import { AppError } from '../../../middlewares/error.middleware'
import {
  InboundShipmentFilters,
  InboundShipmentResponse,
  InboundShipmentUpdatePayload,
} from '../../../types/purchase-orders.types'

async function verifyAccountAccess(userId: string, accountId: string): Promise<void> {
  const userAccount = await prisma.userAccount.findFirst({
    where: { userId, accountId, isActive: true },
  })
  if (!userAccount) {
    throw new AppError('Account not found or access denied', 403)
  }
}

function mapShipment(record: any): InboundShipmentResponse {
  return {
    id: record.id,
    purchaseOrderId: record.purchaseOrderId,
    sku: record.sku,
    quantityShipped: record.quantityShipped,
    quantityReceived: record.quantityReceived,
    shipmentDate: record.shipmentDate,
    receivedDate: record.receivedDate,
    status: record.status,
    purchaseOrder: record.purchaseOrder
      ? {
          id: record.purchaseOrder.id,
          poNumber: record.purchaseOrder.poNumber,
          marketplaceId: record.purchaseOrder.marketplaceId,
        }
      : undefined,
  }
}

export async function listInboundShipments(
  userId: string,
  filters: InboundShipmentFilters
): Promise<{ data: InboundShipmentResponse[]; total: number }> {
  const { accountId, purchaseOrderId, sku, status } = filters

  if (!accountId) {
    throw new AppError('accountId is required', 400)
  }

  await verifyAccountAccess(userId, accountId)

  const shipments = await prisma.inboundShipment.findMany({
    where: {
      purchaseOrder: {
        accountId,
      },
      purchaseOrderId: purchaseOrderId || undefined,
      sku: sku || undefined,
      status: status || undefined,
    },
    include: {
      purchaseOrder: true,
    },
    orderBy: { shipmentDate: 'desc' },
  })

  return {
    data: shipments.map(mapShipment),
    total: shipments.length,
  }
}

export async function updateInboundShipment(
  userId: string,
  id: string,
  payload: InboundShipmentUpdatePayload
): Promise<InboundShipmentResponse> {
  const { accountId, quantityReceived, status, receivedDate } = payload

  if (!accountId) {
    throw new AppError('accountId is required', 400)
  }

  await verifyAccountAccess(userId, accountId)

  const existing = await prisma.inboundShipment.findFirst({
    where: {
      id,
      purchaseOrder: { accountId },
    },
    include: {
      purchaseOrder: true,
    },
  })

  if (!existing) {
    throw new AppError('Inbound shipment not found', 404)
  }

  const newReceived = Math.max(quantityReceived, 0)
  const delta = newReceived - existing.quantityReceived

  const updated = await prisma.inboundShipment.update({
    where: { id: existing.id },
    data: {
      quantityReceived: newReceived,
      status: status || undefined,
      receivedDate: receivedDate ? new Date(receivedDate) : undefined,
    },
    include: {
      purchaseOrder: true,
    },
  })

  if (delta > 0 && updated.purchaseOrder?.marketplaceId) {
    await prisma.inventoryStock.upsert({
      where: {
        accountId_sku_marketplaceId: {
          accountId,
          sku: updated.sku,
          marketplaceId: updated.purchaseOrder.marketplaceId,
        },
      },
      update: {
        quantityAvailable: {
          increment: delta,
        },
        lastSyncedAt: new Date(),
      },
      create: {
        accountId,
        sku: updated.sku,
        marketplaceId: updated.purchaseOrder.marketplaceId,
        quantityAvailable: delta,
        quantityReserved: 0,
        lowStockThreshold: 10,
        lastSyncedAt: new Date(),
      },
    })
  }

  const allShipments = await prisma.inboundShipment.findMany({
    where: { purchaseOrderId: existing.purchaseOrderId },
  })

  const allReceived = allShipments.every(
    (shipment) => shipment.status === 'received' || shipment.quantityReceived >= shipment.quantityShipped
  )
  const anyReceived = allShipments.some((shipment) => shipment.quantityReceived > 0)

  await prisma.purchaseOrder.update({
    where: { id: existing.purchaseOrderId },
    data: {
      status: allReceived ? 'received' : anyReceived ? 'in-transit' : 'pending',
      receivedDate: allReceived ? new Date() : null,
    },
  })

  return mapShipment(updated)
}

