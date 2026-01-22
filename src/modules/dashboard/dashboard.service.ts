import prisma from '../../config/db'
import { AppError } from '../../middlewares/error.middleware'

export interface DashboardSummary {
  totalRevenue: number
  totalProducts: number
  activeCampaigns: number
  totalAlerts: number
  recentOrders: number
  lowStockItems: number
}

async function verifyAccountAccess(userId: string, accountId: string): Promise<void> {
  const userAccount = await prisma.userAccount.findFirst({
    where: { userId, accountId, isActive: true },
  })
  if (!userAccount) {
    throw new AppError('Account not found or access denied', 403)
  }
}

export async function getDashboardSummary(
  userId: string,
  accountId: string
): Promise<DashboardSummary> {
  if (!accountId) {
    throw new AppError('accountId is required', 400)
  }

  await verifyAccountAccess(userId, accountId)

  // Get total revenue from orders
  const revenueResult = await prisma.order.aggregate({
    where: {
      accountId,
      orderStatus: { in: ['shipped', 'delivered'] },
    },
    _sum: {
      totalAmount: true,
    },
  })
  const totalRevenue = Number(revenueResult._sum.totalAmount || 0)

  // Get total products count
  const productsCount = await prisma.product.count({
    where: {
      accountId,
      status: 'active',
    },
  })

  // Get active PPC campaigns count
  const activeCampaigns = await prisma.pPCCampaign.count({
    where: {
      accountId,
      status: 'active',
    },
  })

  // Get total alerts count
  const totalAlerts = await prisma.alert.count({
    where: {
      accountId,
      status: { in: ['unread', 'read'] },
    },
  })

  // Get recent orders count (last 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const recentOrders = await prisma.order.count({
    where: {
      accountId,
      orderDate: { gte: thirtyDaysAgo },
    },
  })

  // Get low stock items count
  // We need to get all inventory stock records and filter in memory
  // since Prisma doesn't support comparing two fields directly
  const inventoryStocks = await prisma.inventoryStock.findMany({
    where: { accountId },
    select: {
      quantityAvailable: true,
      lowStockThreshold: true,
    },
  })
  const lowStockItems = inventoryStocks.filter(
    (stock) => stock.quantityAvailable <= stock.lowStockThreshold
  ).length

  return {
    totalRevenue,
    totalProducts: productsCount,
    activeCampaigns,
    totalAlerts,
    recentOrders,
    lowStockItems,
  }
}

