/**
 * Queue Workers
 * 
 * Initializes all workers for processing jobs
 * Workers are separate from schedulers - they process the jobs
 */

import { createWorker, QueueName } from '../config/queue'
import { processDataSyncJob } from './processors/data-sync.processor'
import { processReportsJob } from './processors/reports.processor'
import { processAlertsJob } from './processors/alerts.processor'
import { processManualSyncJob } from './processors/manual-sync.processor'
import { logger } from '../config/logger'
import { isRedisConnected } from '../config/redis'

/**
 * Initialize all workers
 */
export function initializeWorkers(): void {
  if (!isRedisConnected()) {
    logger.warn('⚠️  Redis not available - workers will not be initialized')
    return
  }

  try {
    // Create workers for each queue
    createWorker(QueueName.DATA_SYNC, processDataSyncJob)
    createWorker(QueueName.REPORTS, processReportsJob)
    createWorker(QueueName.ALERTS, processAlertsJob)
    createWorker(QueueName.MANUAL_SYNC, processManualSyncJob)

    logger.info('✅ All workers initialized')
  } catch (error) {
    logger.error('Failed to initialize workers', error)
    throw error
  }
}
