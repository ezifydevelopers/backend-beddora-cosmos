/**
 * Reports Scheduler
 * 
 * Schedules report generation jobs using BullMQ repeatable jobs
 */

import { getQueue, QueueName } from '../../config/queue'
import { logger } from '../../config/logger'
import { ReportsJobData } from '../../config/queue'
import { isRedisConnected } from '../../config/redis'

/**
 * Initialize reports scheduler
 * 
 * Creates repeatable job that runs daily at 2 AM
 */
export async function initializeReportsScheduler(): Promise<void> {
  if (!isRedisConnected()) {
    logger.warn('⚠️  Redis not available - reports scheduler will not work')
    return
  }

  try {
    const queue = getQueue<ReportsJobData>(QueueName.REPORTS)

    // Schedule job to run daily at 2 AM
    await queue.add(
      'generate-reports',
      {},
      {
        repeat: {
          pattern: '0 2 * * *', // Daily at 2 AM
        },
        jobId: 'reports-recurring',
      }
    )

    logger.info('✅ Reports scheduler initialized (runs daily at 2 AM)')
  } catch (error) {
    logger.error('Failed to initialize reports scheduler', error)
    throw error
  }
}
