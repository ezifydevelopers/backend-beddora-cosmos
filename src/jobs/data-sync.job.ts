import cron from 'node-cron'
import prisma from '../config/db'
import { logger } from '../config/logger'
import * as syncService from '../modules/amazon/sync.service'

/**
 * Data Sync Job
 * Cron job to sync data from Amazon SP API
 * 
 * Runs: Every hour
 * Future microservice: Move to a separate job-service
 */

export function startDataSyncJob() {
  // Run every hour at minute 0
  cron.schedule('0 * * * *', async () => {
    logger.info('Starting data sync job...')

    try {
      // Get all active Amazon accounts (linked Seller Central accounts)
      const amazonAccounts = await prisma.amazonAccount.findMany({
        where: { isActive: true },
      })

      // Sync data for each Amazon account
      for (const amazonAccount of amazonAccounts) {
        try {
          logger.info(`Syncing data for Amazon account: ${amazonAccount.id} (user: ${amazonAccount.userId})`)

          // Sync orders
          await syncService.syncOrders(amazonAccount.userId, amazonAccount.id)

          // Sync listings (products)
          await syncService.syncListings(amazonAccount.userId, amazonAccount.id)

          // Sync inventory
          await syncService.syncInventory(amazonAccount.userId, amazonAccount.id)

          // Sync PPC campaigns
          await syncService.syncPPC(amazonAccount.userId, amazonAccount.id)

          logger.info(`Completed sync for Amazon account: ${amazonAccount.id}`)
        } catch (error) {
          logger.error(`Failed to sync Amazon account ${amazonAccount.id}`, error)
          // Continue with next account
        }
      }

      logger.info('Data sync job completed')
    } catch (error) {
      logger.error('Data sync job failed', error)
    }
  })

  logger.info('Data sync job scheduled (runs every hour)')
}

