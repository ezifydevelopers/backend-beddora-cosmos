/**
 * Multi-Marketplace Service
 */

import prisma from '../../config/db'
import { AppError } from '../../middlewares/error.middleware'
import { UserMarketplaceInput, UserMarketplaceUpdate } from './marketplace.types'
import { logger } from '../../config/logger'

async function createAuditLog(
  userId: string,
  action: string,
  entityId: string,
  changes?: Record<string, any>
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        entity: 'UserMarketplace',
        entityId,
        changes: changes ? JSON.parse(JSON.stringify(changes)) : null,
      },
    })
  } catch (error) {
    logger.error('Failed to create audit log', { error, userId, action, entityId })
  }
}

export async function getSupportedMarketplaces() {
  const marketplaces = await prisma.marketplace.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
  })
  return { data: marketplaces }
}

export async function getUserMarketplaces(userId: string) {
  const linked = await prisma.userMarketplace.findMany({
    where: { userId },
    include: {
      marketplace: true,
      amazonAccount: true,
    },
    orderBy: { linkedAt: 'desc' },
  })
  return { data: linked }
}

export async function linkMarketplace(userId: string, input: UserMarketplaceInput) {
  const marketplace = await prisma.marketplace.findFirst({
    where: { id: input.marketplaceId, isActive: true },
  })
  if (!marketplace) {
    throw new AppError('Marketplace not found', 404)
  }

  const existing = await prisma.userMarketplace.findFirst({
    where: { userId, marketplaceId: input.marketplaceId },
  })
  if (existing) {
    throw new AppError('Marketplace already linked', 409)
  }

  const created = await prisma.userMarketplace.create({
    data: {
      userId,
      marketplaceId: input.marketplaceId,
      amazonAccountId: input.amazonAccountId || null,
      credentials: input.credentials ? JSON.parse(JSON.stringify(input.credentials)) : null,
      status: input.status || 'active',
    },
  })

  await createAuditLog(userId, 'USER_MARKETPLACE_LINKED', created.id, {
    marketplaceId: input.marketplaceId,
  })

  return { data: created }
}

export async function updateUserMarketplace(
  userId: string,
  linkId: string,
  update: UserMarketplaceUpdate
) {
  const existing = await prisma.userMarketplace.findFirst({
    where: { id: linkId, userId },
  })
  if (!existing) {
    throw new AppError('Linked marketplace not found', 404)
  }

  const updated = await prisma.userMarketplace.update({
    where: { id: linkId },
    data: {
      amazonAccountId: update.amazonAccountId ?? existing.amazonAccountId,
      credentials:
        update.credentials !== undefined
          ? update.credentials
            ? JSON.parse(JSON.stringify(update.credentials))
            : null
          : existing.credentials,
      status: update.status ?? existing.status,
    },
  })

  await createAuditLog(userId, 'USER_MARKETPLACE_UPDATED', updated.id)

  return { data: updated }
}

export async function unlinkMarketplace(userId: string, linkId: string) {
  const existing = await prisma.userMarketplace.findFirst({
    where: { id: linkId, userId },
  })
  if (!existing) {
    throw new AppError('Linked marketplace not found', 404)
  }

  await prisma.userMarketplace.delete({ where: { id: linkId } })
  await createAuditLog(userId, 'USER_MARKETPLACE_UNLINKED', linkId)

  return { success: true }
}

