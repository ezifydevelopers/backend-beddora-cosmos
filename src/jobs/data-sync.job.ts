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
      // Get all active accounts
      const accounts = await prisma.account.findMany({
        where: { isActive: true },
      })

      // Sync data for each account
      for (const account of accounts) {
        try {
          logger.info(`Syncing data for account: ${account.id}`)

          // Sync orders
          await syncService.syncOrders(account.id)

          // Sync products
          await syncService.syncProducts(account.id)

          // Sync inventory
          await syncService.syncInventory(account.id)

          // Sync PPC campaigns
          await syncService.syncPPCCampaigns(account.id)

          logger.info(`Completed sync for account: ${account.id}`)
        } catch (error) {
          logger.error(`Failed to sync account ${account.id}`, error)
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

