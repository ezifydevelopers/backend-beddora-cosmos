import cron from 'node-cron'
import prisma from '../config/db'
import { logger } from '../config/logger'

/**
 * Alerts Generation Job
 * Cron job to check conditions and generate alerts
 * 
 * Runs: Every 15 minutes
 * Future microservice: Move to a separate alerts-service
 */

export function startAlertsJob() {
  // Run every 15 minutes
  cron.schedule('*/15 * * * *', async () => {
    logger.info('Starting alerts generation job...')

    try {
      // TODO: Implement alert generation logic
      // 1. Check low stock products
      // 2. Check high ACOS campaigns
      // 3. Check expense thresholds
      // 4. Create alerts in database

      // Example: Check for low stock
      const lowStockProducts = await prisma.product.findMany({
        where: {
          quantity: {
            lte: prisma.product.fields.reorderLevel,
          },
        },
        include: {
          account: true,
        },
      })

      for (const product of lowStockProducts) {
        // Check if alert already exists
        const existingAlert = await prisma.alert.findFirst({
          where: {
            accountId: product.accountId,
            type: 'low_stock',
            metadata: {
              path: ['productId'],
              equals: product.id,
            },
            isRead: false,
          },
        })

        if (!existingAlert) {
          // Create new alert
          await prisma.alert.create({
            data: {
              accountId: product.accountId,
              type: 'low_stock',
              severity: 'warning',
              title: 'Low Stock Alert',
              message: `Product ${product.title} (SKU: ${product.sku}) is running low. Current quantity: ${product.quantity}`,
              metadata: {
                productId: product.id,
                sku: product.sku,
                quantity: product.quantity,
                reorderLevel: product.reorderLevel,
              },
            },
          })
        }
      }

      logger.info(`Generated ${lowStockProducts.length} low stock alerts`)
      logger.info('Alerts generation job completed')
    } catch (error) {
      logger.error('Alerts generation job failed', error)
    }
  })

  logger.info('Alerts generation job scheduled (runs every 15 minutes)')
}

