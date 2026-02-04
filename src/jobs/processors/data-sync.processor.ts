/**
 * Data Sync Job Processor
 * 
 * Processes data sync jobs from the queue
 * Handles syncing orders, fees, PPC, inventory, listings, and refunds
 */

import { Job } from 'bullmq'
import { logger } from '../../config/logger'
import prisma from '../../config/db'
import * as syncService from '../../modules/amazon/sync.service'
import { DataSyncJobData, getQueue, QueueName } from '../../config/queue'

/**
 * Process data sync job
 */
export async function processDataSyncJob(job: Job<DataSyncJobData>): Promise<void> {
  // Handle special case: sync-all-accounts job (recurring job that syncs all accounts)
  if (job.name === 'sync-all-accounts') {
    return await processSyncAllAccountsJob(job)
  }

  const { amazonAccountId, userId, syncType = 'all', options } = job.data

  logger.info(`Processing data sync job`, {
    jobId: job.id,
    amazonAccountId,
    userId,
    syncType,
  })

  try {
    // Update job progress
    await job.updateProgress(10)

    // Determine which syncs to run
    const syncsToRun: Array<{ name: string; fn: () => Promise<any> }> = []

    if (syncType === 'all' || syncType === 'orders') {
      syncsToRun.push({
        name: 'orders',
        fn: () => syncService.syncOrders(userId, amazonAccountId, options),
      })
    }

    if (syncType === 'all' || syncType === 'fees') {
      syncsToRun.push({
        name: 'fees',
        fn: () => syncService.syncFees(userId, amazonAccountId, options),
      })
    }

    if (syncType === 'all' || syncType === 'ppc') {
      syncsToRun.push({
        name: 'ppc',
        fn: () => syncService.syncPPC(userId, amazonAccountId, options),
      })
    }

    if (syncType === 'all' || syncType === 'inventory') {
      syncsToRun.push({
        name: 'inventory',
        fn: () => syncService.syncInventory(userId, amazonAccountId, options),
      })
    }

    if (syncType === 'all' || syncType === 'listings') {
      syncsToRun.push({
        name: 'listings',
        fn: () => syncService.syncListings(userId, amazonAccountId, options),
      })
    }

    if (syncType === 'all' || syncType === 'refunds') {
      syncsToRun.push({
        name: 'refunds',
        fn: () => syncService.syncRefunds(userId, amazonAccountId, options),
      })
    }

    // Process each sync
    const results: Record<string, any> = {}
    const totalSyncs = syncsToRun.length
    let completedSyncs = 0

    for (const sync of syncsToRun) {
      try {
        logger.info(`Starting ${sync.name} sync`, {
          jobId: job.id,
          amazonAccountId,
        })

        const result = await sync.fn()
        results[sync.name] = {
          success: result.success,
          recordsSynced: result.recordsSynced,
          recordsFailed: result.recordsFailed,
        }

        completedSyncs++
        const progress = 10 + Math.floor((completedSyncs / totalSyncs) * 80)
        await job.updateProgress(progress)

        logger.info(`Completed ${sync.name} sync`, {
          jobId: job.id,
          amazonAccountId,
          recordsSynced: result.recordsSynced,
          recordsFailed: result.recordsFailed,
        })
      } catch (error: any) {
        logger.error(`Failed ${sync.name} sync`, {
          jobId: job.id,
          amazonAccountId,
          error: error.message,
        })

        results[sync.name] = {
          success: false,
          error: error.message,
        }

        // Continue with other syncs even if one fails
        completedSyncs++
        const progress = 10 + Math.floor((completedSyncs / totalSyncs) * 80)
        await job.updateProgress(progress)
      }
    }

    // Final progress update
    await job.updateProgress(100)

    logger.info(`Data sync job completed`, {
      jobId: job.id,
      amazonAccountId,
      results,
    })

    // Return results for job completion tracking
    return results as any
  } catch (error: any) {
    logger.error(`Data sync job failed`, {
      jobId: job.id,
      amazonAccountId,
      error: error.message,
      stack: error.stack,
    })

    throw error // Re-throw to mark job as failed
  }
}

/**
 * Process sync-all-accounts job (legacy - kept for backward compatibility)
 * 
 * This job fetches all active accounts and creates individual sync jobs for each
 */
async function processSyncAllAccountsJob(job: Job<DataSyncJobData>): Promise<void> {
  logger.info(`Processing sync-all-accounts job`, {
    jobId: job.id,
  })

  try {
    await job.updateProgress(10)

    // Get all active Amazon accounts
    const amazonAccounts = await prisma.amazonAccount.findMany({
      where: { isActive: true },
    })

    await job.updateProgress(30)

    logger.info(`Found ${amazonAccounts.length} active Amazon accounts to sync`)

    // Create individual sync jobs for each account
    const queue = getQueue<DataSyncJobData>(QueueName.DATA_SYNC)
    const jobPromises = amazonAccounts.map((account) => {
      return queue.add(
        `sync-account-${account.id}`,
        {
          amazonAccountId: account.id,
          userId: account.userId,
          syncType: 'all',
        },
        {
          jobId: `sync-account-${account.id}-${Date.now()}`,
          priority: 1,
        }
      )
    })

    await Promise.all(jobPromises)

    await job.updateProgress(100)

    logger.info(`Created ${amazonAccounts.length} sync jobs for active accounts`)
  } catch (error: any) {
    logger.error(`Sync-all-accounts job failed`, {
      jobId: job.id,
      error: error.message,
      stack: error.stack,
    })

    throw error
  }
}

/**
 * Process check-sync-schedules job
 * 
 * This job checks for accounts due for sync based on their per-account schedules
 */
async function processCheckSyncSchedulesJob(job: Job<DataSyncJobData>): Promise<void> {
  logger.info(`Processing check-sync-schedules job`, {
    jobId: job.id,
  })

  try {
    await job.updateProgress(10)

    // Import sync schedule service
    const syncScheduleService = await import('../../modules/amazon/sync-schedule.service')

    // Get all accounts due for sync
    const accountsDueForSync = await syncScheduleService.getAccountsDueForSync()

    await job.updateProgress(30)

    logger.info(`Found ${accountsDueForSync.length} accounts due for sync`)

    // Create sync jobs for each account/sync type combination
    const queue = getQueue<DataSyncJobData>(QueueName.DATA_SYNC)
    const jobPromises = accountsDueForSync.map(({ amazonAccountId, userId, syncType }) => {
      return queue.add(
        `scheduled-sync-${amazonAccountId}-${syncType}`,
        {
          amazonAccountId,
          userId,
          syncType,
        },
        {
          jobId: `scheduled-sync-${amazonAccountId}-${syncType}-${Date.now()}`,
          priority: 2, // Lower priority than manual syncs
        }
      )
    })

    await Promise.all(jobPromises)

    // Mark syncs as completed and schedule next runs
    for (const { amazonAccountId, userId, syncType } of accountsDueForSync) {
      try {
        await syncScheduleService.markSyncCompleted(amazonAccountId, userId, syncType)
      } catch (error: any) {
        logger.error(`Failed to mark sync as completed`, {
          amazonAccountId,
          syncType,
          error: error.message,
        })
      }
    }

    await job.updateProgress(100)

    logger.info(`Created ${accountsDueForSync.length} scheduled sync jobs`)
  } catch (error: any) {
    logger.error(`Check-sync-schedules job failed`, {
      jobId: job.id,
      error: error.message,
      stack: error.stack,
    })

    throw error
  }
}