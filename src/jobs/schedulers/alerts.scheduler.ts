/**
 * Alerts Scheduler
 * 
 * Schedules alert generation jobs using BullMQ repeatable jobs
 */

import { getQueue, QueueName } from '../../config/queue'
import { logger } from '../../config/logger'
import { AlertsJobData } from '../../config/queue'
import { isRedisConnected } from '../../config/redis'

/**
 * Initialize alerts scheduler
 * 
 * Creates repeatable job that runs every 15 minutes
 */
export async function initializeAlertsScheduler(): Promise<void> {
  if (!isRedisConnected()) {
    logger.warn('⚠️  Redis not available - alerts scheduler will not work')
    return
  }

  try {
    const queue = getQueue<AlertsJobData>(QueueName.ALERTS)

    // Schedule job to run every 15 minutes
    await queue.add(
      'generate-alerts',
      {
        alertType: 'all',
      },
      {
        repeat: {
          pattern: '*/15 * * * *', // Every 15 minutes
        },
        jobId: 'alerts-recurring',
      }
    )

    logger.info('✅ Alerts scheduler initialized (runs every 15 minutes)')
  } catch (error) {
    logger.error('Failed to initialize alerts scheduler', error)
    throw error
  }
}
