/**
 * Manual Sync Job Processor
 * 
 * Processes manual sync jobs triggered by users
 * Similar to data sync but with user-initiated context
 */

import { Job } from 'bullmq'
import { logger } from '../../config/logger'
import * as syncService from '../../modules/amazon/sync.service'
import { ManualSyncJobData } from '../../config/queue'

/**
 * Process manual sync job
 */
export async function processManualSyncJob(job: Job<ManualSyncJobData>): Promise<void> {
  const { amazonAccountId, userId, syncType, options } = job.data

  logger.info(`Processing manual sync job`, {
    jobId: job.id,
    amazonAccountId,
    userId,
    syncType,
  })

  try {
    await job.updateProgress(10)

    let result: any

    // Route to appropriate sync function
    switch (syncType) {
      case 'orders':
        result = await syncService.syncOrders(userId, amazonAccountId, options)
        break
      case 'fees':
        result = await syncService.syncFees(userId, amazonAccountId, options)
        break
      case 'ppc':
        result = await syncService.syncPPC(userId, amazonAccountId, options)
        break
      case 'inventory':
        result = await syncService.syncInventory(userId, amazonAccountId, options)
        break
      case 'listings':
        result = await syncService.syncListings(userId, amazonAccountId, options)
        break
      case 'refunds':
        result = await syncService.syncRefunds(userId, amazonAccountId, options)
        break
      case 'all':
        // Run all syncs sequentially
        await job.updateProgress(20)
        await syncService.syncOrders(userId, amazonAccountId, options)
        await job.updateProgress(40)
        await syncService.syncFees(userId, amazonAccountId, options)
        await job.updateProgress(60)
        await syncService.syncPPC(userId, amazonAccountId, options)
        await job.updateProgress(70)
        await syncService.syncInventory(userId, amazonAccountId, options)
        await job.updateProgress(85)
        await syncService.syncListings(userId, amazonAccountId, options)
        await job.updateProgress(95)
        result = await syncService.syncRefunds(userId, amazonAccountId, options)
        break
      default:
        throw new Error(`Unknown sync type: ${syncType}`)
    }

    await job.updateProgress(100)

    logger.info(`Manual sync job completed`, {
      jobId: job.id,
      amazonAccountId,
      syncType,
      result,
    })

    return result
  } catch (error: any) {
    logger.error(`Manual sync job failed`, {
      jobId: job.id,
      amazonAccountId,
      syncType,
      error: error.message,
      stack: error.stack,
    })

    throw error
  }
}
