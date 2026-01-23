/**
 * Data Sync Scheduler
 * 
 * Schedules data sync jobs using BullMQ repeatable jobs
 * Replaces the old node-cron approach
 */

import { getQueue, QueueName } from '../../config/queue'
import { logger } from '../../config/logger'
import prisma from '../../config/db'
import { DataSyncJobData } from '../../config/queue'
import { isRedisConnected } from '../../config/redis'

/**
 * Initialize data sync scheduler
 * 
 * Creates a recurring job that checks for accounts due for sync based on their schedules
 * Runs every 15 minutes to check for due syncs
 */
export async function initializeDataSyncScheduler(): Promise<void> {
  if (!isRedisConnected()) {
    logger.warn('⚠️  Redis not available - data sync scheduler will not work')
    return
  }

  try {
    const queue = getQueue<DataSyncJobData>(QueueName.DATA_SYNC)

    // Schedule job to run every 15 minutes
    // This job will check for accounts due for sync based on their per-account schedules
    await queue.add(
      'check-sync-schedules',
      {
        // This is a meta-job that will check schedules and create sync jobs
      } as any,
      {
        repeat: {
          pattern: '*/15 * * * *', // Every 15 minutes (cron pattern)
        },
        jobId: 'data-sync-schedule-checker', // Unique ID to prevent duplicates
      }
    )

    logger.info('✅ Data sync scheduler initialized (checks schedules every 15 minutes)')
  } catch (error) {
    logger.error('Failed to initialize data sync scheduler', error)
    throw error
  }
}

/**
 * Schedule sync for a specific account
 * 
 * This can be called manually or by the recurring job
 */
export async function scheduleAccountSync(amazonAccountId: string, userId: string): Promise<void> {
  if (!isRedisConnected()) {
    throw new Error('Redis is required for queue operations')
  }

  const queue = getQueue<DataSyncJobData>(QueueName.DATA_SYNC)

  await queue.add(
    `sync-account-${amazonAccountId}`,
    {
      amazonAccountId,
      userId,
      syncType: 'all',
    },
    {
      jobId: `sync-account-${amazonAccountId}-${Date.now()}`, // Unique job ID
      priority: 1, // Higher priority for individual account syncs
    }
  )

  logger.info(`Scheduled sync job for account ${amazonAccountId}`)
}

/**
 * Close scheduler
 * 
 * Note: In BullMQ v4+, repeatable jobs are managed by the queue itself,
 * so there's no separate scheduler to close
 */
export async function closeDataSyncScheduler(): Promise<void> {
  // Remove repeatable job if needed
  try {
    const queue = getQueue<DataSyncJobData>(QueueName.DATA_SYNC)
    await queue.removeRepeatable('sync-all-accounts', {
      pattern: '0 * * * *',
    })
    logger.info('✅ Data sync scheduler closed')
  } catch (error) {
    logger.warn('Failed to remove repeatable job', error)
  }
}
