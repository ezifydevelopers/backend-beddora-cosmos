import prisma from '../../../config/db'
import { AppError } from '../../../middlewares/error.middleware'
import { logger } from '../../../config/logger'
import {
  CreateCOGSRequest,
  UpdateCOGSRequest,
  CreateBatchRequest,
  COGSResponse,
  BatchResponse,
  COGSBySKUResponse,
  COGSHistoricalResponse,
  BatchDetailsResponse,
  CostMethod,
} from '../../../types/cogs.types'

/**
 * COGS Service
 * 
 * Handles all business logic for Cost of Goods Sold calculations
 * 
 * Business Logic:
 * - Supports multiple costing methods (batch, time-period, weighted average)
 * - Tracks inbound shipment costs
 * - Associates COGS with marketplaces for accurate profit calculation
 * - Calculates historical COGS for reporting
 * - Validates user permissions for COGS edits
 */

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Verify user has access to account
 */
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

/**
 * Verify user has admin or manager role
 */
async function verifyAdminOrManager(userId: string): Promise<boolean> {
  const userRoles = await prisma.userRole.findMany({
    where: {
      userId,
    },
    include: {
      role: true,
    },
  })

  const roleNames = userRoles.map((ur) => ur.role.name.toUpperCase())
  return roleNames.includes('ADMIN') || roleNames.includes('MANAGER')
}

/**
 * Calculate total cost including shipment
 */
function calculateTotalCost(
  quantity: number,
  unitCost: number,
  shipmentCost?: number | null
): number {
  const baseCost = quantity * Number(unitCost)
  const shipment = shipmentCost ? Number(shipmentCost) : 0
  return baseCost + shipment
}

/**
 * Calculate weighted average cost
 */
function calculateWeightedAverage(
  entries: Array<{ quantity: number; unitCost: number }>
): number {
  if (entries.length === 0) return 0

  const totalCost = entries.reduce(
    (sum, entry) => sum + entry.quantity * Number(entry.unitCost),
    0
  )
  const totalQuantity = entries.reduce((sum, entry) => sum + entry.quantity, 0)

  return totalQuantity > 0 ? totalCost / totalQuantity : 0
}

// ============================================
// COGS CRUD OPERATIONS
// ============================================

/**
 * Get COGS by SKU
 * Returns all COGS entries for a specific SKU across marketplaces
 */
export async function getCOGSBySKU(
  sku: string,
  accountId: string,
  userId: string
): Promise<COGSBySKUResponse> {
  await verifyAccountAccess(userId, accountId)

  const cogsEntries = await prisma.cOGS.findMany({
    where: {
      sku,
      accountId,
    },
    include: {
      marketplace: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: {
      purchaseDate: 'desc',
    },
  })

  const totalQuantity = cogsEntries.reduce((sum, entry) => sum + entry.quantity, 0)
  const totalCost = cogsEntries.reduce((sum, entry) => Number(entry.totalCost), 0)
  const averageUnitCost = totalQuantity > 0 ? totalCost / totalQuantity : 0

  // Group by marketplace
  const marketplaceMap = new Map<string, {
    marketplaceId: string | null
    marketplaceName: string | null
    quantity: number
    totalCost: number
  }>()

  for (const entry of cogsEntries) {
    const key = entry.marketplaceId || 'no-marketplace'
    if (!marketplaceMap.has(key)) {
      marketplaceMap.set(key, {
        marketplaceId: entry.marketplaceId,
        marketplaceName: entry.marketplace?.name || null,
        quantity: 0,
        totalCost: 0,
      })
    }

    const mapEntry = marketplaceMap.get(key)!
    mapEntry.quantity += entry.quantity
    mapEntry.totalCost += Number(entry.totalCost)
  }

  const byMarketplace = Array.from(marketplaceMap.values()).map((entry) => ({
    ...entry,
    averageUnitCost: entry.quantity > 0 ? entry.totalCost / entry.quantity : 0,
  }))

  return {
    sku,
    accountId,
    totalQuantity,
    averageUnitCost: Number(averageUnitCost.toFixed(4)),
    totalCost: Number(totalCost.toFixed(2)),
    entries: cogsEntries.map((entry) => ({
      id: entry.id,
      sku: entry.sku,
      accountId: entry.accountId,
      marketplaceId: entry.marketplaceId,
      batchId: entry.batchId,
      quantity: entry.quantity,
      unitCost: Number(entry.unitCost),
      totalCost: Number(entry.totalCost),
      costMethod: entry.costMethod as CostMethod,
      shipmentCost: entry.shipmentCost ? Number(entry.shipmentCost) : null,
      purchaseDate: entry.purchaseDate.toISOString(),
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
    })),
    byMarketplace,
  }
}

/**
 * Create COGS entry
 * Creates a new COGS record with validation
 */
export async function createCOGS(
  data: CreateCOGSRequest,
  userId: string
): Promise<COGSResponse> {
  await verifyAccountAccess(userId, data.accountId)

  // Validate batch if provided
  if (data.batchId) {
    const batch = await prisma.batch.findUnique({
      where: { id: data.batchId },
    })

    if (!batch) {
      throw new AppError('Batch not found', 404)
    }

    if (batch.sku !== data.sku || batch.accountId !== data.accountId) {
      throw new AppError('Batch does not match SKU or account', 400)
    }
  }

  // Calculate total cost
  const totalCost = calculateTotalCost(data.quantity, data.unitCost, data.shipmentCost)

  // Create COGS entry
  const cogs = await prisma.cOGS.create({
    data: {
      sku: data.sku,
      accountId: data.accountId,
      marketplaceId: data.marketplaceId || null,
      batchId: data.batchId || null,
      quantity: data.quantity,
      unitCost: data.unitCost,
      totalCost,
      costMethod: data.costMethod || CostMethod.WEIGHTED_AVERAGE,
      shipmentCost: data.shipmentCost || null,
      purchaseDate: data.purchaseDate ? new Date(data.purchaseDate) : new Date(),
    },
  })

  logger.info('COGS entry created', {
    userId,
    cogsId: cogs.id,
    sku: cogs.sku,
    accountId: cogs.accountId,
  })

  return {
    id: cogs.id,
    sku: cogs.sku,
    accountId: cogs.accountId,
    marketplaceId: cogs.marketplaceId,
    batchId: cogs.batchId,
    quantity: cogs.quantity,
    unitCost: Number(cogs.unitCost),
    totalCost: Number(cogs.totalCost),
    costMethod: cogs.costMethod as CostMethod,
    shipmentCost: cogs.shipmentCost ? Number(cogs.shipmentCost) : null,
    purchaseDate: cogs.purchaseDate.toISOString(),
    createdAt: cogs.createdAt.toISOString(),
    updatedAt: cogs.updatedAt.toISOString(),
  }
}

/**
 * Update COGS entry
 * Updates an existing COGS record (requires admin/manager role)
 */
export async function updateCOGS(
  id: string,
  data: UpdateCOGSRequest,
  userId: string
): Promise<COGSResponse> {
  const cogs = await prisma.cOGS.findUnique({
    where: { id },
    include: {
      account: true,
    },
  })

  if (!cogs) {
    throw new AppError('COGS entry not found', 404)
  }

  await verifyAccountAccess(userId, cogs.accountId)

  // Verify user has permission to edit
  const hasPermission = await verifyAdminOrManager(userId)
  if (!hasPermission) {
    throw new AppError('Insufficient permissions. Admin or Manager role required.', 403)
  }

  // Calculate new total cost if unit cost or quantity changed
  const quantity = data.quantity !== undefined ? data.quantity : cogs.quantity
  const unitCost = data.unitCost !== undefined ? data.unitCost : Number(cogs.unitCost)
  const shipmentCost = data.shipmentCost !== undefined ? data.shipmentCost : (cogs.shipmentCost ? Number(cogs.shipmentCost) : null)
  const totalCost = calculateTotalCost(quantity, unitCost, shipmentCost)

  const updated = await prisma.cOGS.update({
    where: { id },
    data: {
      ...(data.quantity !== undefined && { quantity: data.quantity }),
      ...(data.unitCost !== undefined && { unitCost: data.unitCost }),
      ...(data.shipmentCost !== undefined && { shipmentCost: data.shipmentCost }),
      ...(data.costMethod !== undefined && { costMethod: data.costMethod }),
      ...(data.purchaseDate !== undefined && { purchaseDate: new Date(data.purchaseDate) }),
      totalCost,
    },
  })

  logger.info('COGS entry updated', {
    userId,
    cogsId: updated.id,
    sku: updated.sku,
  })

  return {
    id: updated.id,
    sku: updated.sku,
    accountId: updated.accountId,
    marketplaceId: updated.marketplaceId,
    batchId: updated.batchId,
    quantity: updated.quantity,
    unitCost: Number(updated.unitCost),
    totalCost: Number(updated.totalCost),
    costMethod: updated.costMethod as CostMethod,
    shipmentCost: updated.shipmentCost ? Number(updated.shipmentCost) : null,
    purchaseDate: updated.purchaseDate.toISOString(),
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  }
}

// ============================================
// BATCH OPERATIONS
// ============================================

/**
 * Get batch details
 * Returns batch information with associated COGS entries
 */
export async function getBatchDetails(
  batchId: string,
  userId: string
): Promise<BatchDetailsResponse> {
  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    include: {
      cogs: {
        orderBy: {
          purchaseDate: 'desc',
        },
      },
    },
  })

  if (!batch) {
    throw new AppError('Batch not found', 404)
  }

  await verifyAccountAccess(userId, batch.accountId)

  const usedQuantity = batch.cogs.reduce((sum, cogs) => sum + cogs.quantity, 0)
  const remainingQuantity = batch.quantity - usedQuantity

  return {
    id: batch.id,
    sku: batch.sku,
    accountId: batch.accountId,
    quantity: batch.quantity,
    unitCost: Number(batch.unitCost),
    totalCost: Number(batch.totalCost),
    receivedAt: batch.receivedAt.toISOString(),
    notes: batch.notes,
    createdAt: batch.createdAt.toISOString(),
    updatedAt: batch.updatedAt.toISOString(),
    cogsEntries: batch.cogs.map((cogs) => ({
      id: cogs.id,
      sku: cogs.sku,
      accountId: cogs.accountId,
      marketplaceId: cogs.marketplaceId,
      batchId: cogs.batchId,
      quantity: cogs.quantity,
      unitCost: Number(cogs.unitCost),
      totalCost: Number(cogs.totalCost),
      costMethod: cogs.costMethod as CostMethod,
      shipmentCost: cogs.shipmentCost ? Number(cogs.shipmentCost) : null,
      purchaseDate: cogs.purchaseDate.toISOString(),
      createdAt: cogs.createdAt.toISOString(),
      updatedAt: cogs.updatedAt.toISOString(),
    })),
    remainingQuantity,
    usedQuantity,
  }
}

/**
 * Create batch
 * Creates a new inbound shipment batch
 */
export async function createBatch(
  data: CreateBatchRequest,
  userId: string
): Promise<BatchResponse> {
  await verifyAccountAccess(userId, data.accountId)

  const totalCost = data.quantity * Number(data.unitCost)

  const batch = await prisma.batch.create({
    data: {
      sku: data.sku,
      accountId: data.accountId,
      quantity: data.quantity,
      unitCost: data.unitCost,
      totalCost,
      notes: data.notes || null,
      receivedAt: data.receivedAt ? new Date(data.receivedAt) : new Date(),
    },
  })

  logger.info('Batch created', {
    userId,
    batchId: batch.id,
    sku: batch.sku,
    accountId: batch.accountId,
  })

  return {
    id: batch.id,
    sku: batch.sku,
    accountId: batch.accountId,
    quantity: batch.quantity,
    unitCost: Number(batch.unitCost),
    totalCost: Number(batch.totalCost),
    receivedAt: batch.receivedAt.toISOString(),
    notes: batch.notes,
    createdAt: batch.createdAt.toISOString(),
    updatedAt: batch.updatedAt.toISOString(),
  }
}

// ============================================
// HISTORICAL COGS
// ============================================

/**
 * Get COGS historical data
 * Returns historical COGS for reporting and trend analysis
 */
export async function getCOGSHistorical(
  accountId: string,
  userId: string,
  sku?: string,
  marketplaceId?: string,
  startDate?: string,
  endDate?: string
): Promise<COGSHistoricalResponse> {
  await verifyAccountAccess(userId, accountId)

  const whereClause: any = {
    accountId,
  }

  if (sku) whereClause.sku = sku
  if (marketplaceId) whereClause.marketplaceId = marketplaceId
  if (startDate || endDate) {
    whereClause.purchaseDate = {}
    if (startDate) whereClause.purchaseDate.gte = new Date(startDate)
    if (endDate) {
      const end = new Date(endDate)
      end.setHours(23, 59, 59, 999)
      whereClause.purchaseDate.lte = end
    }
  }

  const cogsEntries = await prisma.cOGS.findMany({
    where: whereClause,
    orderBy: {
      purchaseDate: 'asc',
    },
  })

  const data = cogsEntries.map((entry) => ({
    date: entry.purchaseDate.toISOString().split('T')[0],
    quantity: entry.quantity,
    unitCost: Number(entry.unitCost),
    totalCost: Number(entry.totalCost),
    costMethod: entry.costMethod as CostMethod,
    batchId: entry.batchId,
  }))

  const totalQuantity = cogsEntries.reduce((sum, entry) => sum + entry.quantity, 0)
  const totalCost = cogsEntries.reduce((sum, entry) => Number(entry.totalCost), 0)
  const averageUnitCost = totalQuantity > 0 ? totalCost / totalQuantity : 0

  // Method breakdown
  const methodBreakdown: Record<CostMethod, number> = {
    [CostMethod.BATCH]: 0,
    [CostMethod.TIME_PERIOD]: 0,
    [CostMethod.WEIGHTED_AVERAGE]: 0,
  }

  for (const entry of cogsEntries) {
    const method = entry.costMethod as CostMethod
    methodBreakdown[method] += Number(entry.totalCost)
  }

  return {
    sku: sku || undefined,
    accountId,
    marketplaceId: marketplaceId || undefined,
    startDate: startDate || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: endDate || new Date().toISOString().split('T')[0],
    data,
    summary: {
      totalQuantity,
      averageUnitCost: Number(averageUnitCost.toFixed(4)),
      totalCost: Number(totalCost.toFixed(2)),
      methodBreakdown,
    },
  }
}

