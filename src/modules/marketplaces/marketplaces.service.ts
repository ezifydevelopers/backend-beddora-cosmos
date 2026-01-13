import prisma from '../../config/db'

/**
 * Marketplaces service
 * Handles marketplace data
 */

export async function getMarketplaces() {
  const marketplaces = await prisma.marketplace.findMany({
    where: { isActive: true },
  })
  
  return marketplaces
}

export async function getMarketplaceById(id: string) {
  const marketplace = await prisma.marketplace.findUnique({
    where: { id },
  })
  
  return marketplace
}

