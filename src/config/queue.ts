/**
 * Queue Configuration
 * 
 * BullMQ queue setup for background job processing
 * 
 * Features:
 * - Redis-backed job queues
 * - Automatic retries with exponential backoff
 * - Job priority and delays
 * - Job status tracking
 * - Graceful shutdown
 * 
 * Architecture:
 * - Uses existing Redis connection from redis.ts
 * - Separate queues for different job types
 * - Job processors handle actual work
 * - Schedulers enqueue jobs based on cron patterns
 */

import { Queue, QueueOptions, Worker, WorkerOptions, Job } from 'bullmq'
import { getRedisClient, isRedisConnected } from './redis'
import { logger } from './logger'

/**
 * Queue names
 */
export enum QueueName {
  DATA_SYNC = 'data-sync',
  REPORTS = 'reports',
  ALERTS = 'alerts',
  MANUAL_SYNC = 'manual-sync',
}

/**
 * Job data interfaces
 */
export interface DataSyncJobData {
  amazonAccountId: string
  userId: string
  syncType?: 'orders' | 'fees' | 'ppc' | 'inventory' | 'listings' | 'refunds' | 'all'
  options?: {
    startDate?: string
    endDate?: string
    marketplaceIds?: string[]
    forceFullSync?: boolean
  }
}

export interface ReportsJobData {
  reportId?: string
  userId?: string
}

export interface AlertsJobData {
  alertType?: 'low_stock' | 'high_acos' | 'expense_threshold' | 'all'
}

export interface ManualSyncJobData {
  amazonAccountId: string
  userId: string
  syncType: 'orders' | 'fees' | 'ppc' | 'inventory' | 'listings' | 'refunds' | 'all'
  options?: {
    startDate?: string
    endDate?: string
    marketplaceIds?: string[]
    forceFullSync?: boolean
  }
}

/**
 * Get Redis connection for BullMQ
 * BullMQ can use ioredis connection directly
 */
function getQueueConnection() {
  const redisClient = getRedisClient()
  
  if (!redisClient || !isRedisConnected()) {
    // Return a dummy connection that will fail gracefully
    // This allows the app to start but queues won't work
    return {
      host: 'localhost',
      port: 6379,
    }
  }

  // BullMQ can use ioredis connection directly
  return redisClient
}

/**
 * Default queue options
 */
const defaultQueueOptions: QueueOptions = {
  connection: getQueueConnection(),
  defaultJobOptions: {
    attempts: 5, // Increased from 3 to 5 for better retry coverage
    backoff: {
      type: 'exponential',
      delay: 2000, // Start with 2 seconds, then 4, 8, 16, 32, etc.
    },
    removeOnComplete: {
      age: 24 * 3600, // Keep completed jobs for 24 hours
      count: 1000, // Keep last 1000 completed jobs
    },
    removeOnFail: {
      age: 7 * 24 * 3600, // Keep failed jobs for 7 days
    },
  },
}

/**
 * Default worker options
 */
const defaultWorkerOptions: WorkerOptions = {
  connection: getQueueConnection(),
  concurrency: 5, // Process 5 jobs concurrently
  limiter: {
    max: 10, // Max 10 jobs
    duration: 1000, // Per second
  },
}

/**
 * Queue instances (singletons)
 */
const queues: Map<QueueName, Queue> = new Map()
const workers: Map<QueueName, Worker> = new Map()

/**
 * Initialize a queue
 */
export function createQueue<T = any>(name: QueueName): Queue<T> {
  if (queues.has(name)) {
    return queues.get(name)!
  }

  const queue = new Queue<T>(name, defaultQueueOptions)

  // Set up event handlers
  queue.on('error', (error) => {
    logger.error(`Queue ${name} error:`, error)
  })

  queues.set(name, queue)
  logger.info(`✅ Queue ${name} created`)

  return queue
}

/**
 * Get or create a queue
 */
export function getQueue<T = any>(name: QueueName): Queue<T> {
  if (queues.has(name)) {
    return queues.get(name)!
  }
  return createQueue<T>(name)
}

/**
 * Create a worker for a queue with enhanced error recovery
 */
export function createWorker<T = any>(
  name: QueueName,
  processor: (job: Job<T>) => Promise<any>
): Worker<T> {
  if (workers.has(name)) {
    return workers.get(name)!
  }

  const worker = new Worker<T>(name, processor, defaultWorkerOptions)

  // Set up event handlers
  worker.on('completed', (job) => {
    logger.info(`Job ${job.id} completed in queue ${name}`, {
      jobId: job.id,
      queue: name,
      duration: Date.now() - job.timestamp,
    })
  })

  worker.on('failed', async (job, err) => {
    logger.error(`Job ${job?.id} failed in queue ${name}`, {
      jobId: job?.id,
      queue: name,
      error: err.message,
      attemptsMade: job?.attemptsMade,
    })

    // Handle failed job with error recovery service
    if (job) {
      try {
        const { handleFailedJob } = await import('../jobs/error-recovery.service')
        await handleFailedJob(job, err)
      } catch (recoveryError) {
        logger.error('Failed to handle job failure recovery', {
          jobId: job.id,
          error: recoveryError,
        })
      }
    }
  })

  // Handle retry events
  worker.on('active', (job) => {
    if (job.attemptsMade && job.attemptsMade > 1) {
      logger.info(`Job ${job.id} retrying (attempt ${job.attemptsMade})`, {
        jobId: job.id,
        queue: name,
        attemptsMade: job.attemptsMade,
      })
    }
  })

  worker.on('error', (error) => {
    logger.error(`Worker ${name} error:`, error)
  })

  workers.set(name, worker)
  logger.info(`✅ Worker ${name} created with error recovery`)

  return worker
}

/**
 * Initialize all queues and workers
 */
export async function initializeQueues(): Promise<void> {
  if (!isRedisConnected()) {
    logger.warn('⚠️  Redis not available - queue system will not work')
    logger.warn('⚠️  Queue system requires Redis. Please ensure Redis is running.')
    return
  }

  try {
    // Create queues (workers will be created by their respective modules)
    createQueue<DataSyncJobData>(QueueName.DATA_SYNC)
    createQueue<ReportsJobData>(QueueName.REPORTS)
    createQueue<AlertsJobData>(QueueName.ALERTS)
    createQueue<ManualSyncJobData>(QueueName.MANUAL_SYNC)

    logger.info('✅ All queues initialized')
  } catch (error) {
    logger.error('Failed to initialize queues', error)
    throw error
  }
}

/**
 * Close all queues and workers gracefully
 */
export async function closeQueues(): Promise<void> {
  logger.info('Closing queues and workers...')

  // Close all workers
  for (const [name, worker] of workers.entries()) {
    try {
      await worker.close()
      logger.info(`✅ Worker ${name} closed`)
    } catch (error) {
      logger.error(`Failed to close worker ${name}`, error)
    }
  }
  workers.clear()

  // Close all queues
  for (const [name, queue] of queues.entries()) {
    try {
      await queue.close()
      logger.info(`✅ Queue ${name} closed`)
    } catch (error) {
      logger.error(`Failed to close queue ${name}`, error)
    }
  }
  queues.clear()

  logger.info('✅ All queues and workers closed')
}

/**
 * Get queue statistics
 */
export async function getQueueStats(queueName: QueueName) {
  const queue = getQueue(queueName)
  
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
  ])

  return {
    waiting,
    active,
    completed,
    failed,
    delayed,
    total: waiting + active + completed + failed + delayed,
  }
}

/**
 * Get all queue statistics
 */
export async function getAllQueueStats() {
  const stats: Record<string, any> = {}

  for (const name of Object.values(QueueName)) {
    try {
      stats[name] = await getQueueStats(name)
    } catch (error) {
      logger.error(`Failed to get stats for queue ${name}`, error)
      stats[name] = { error: 'Failed to get stats' }
    }
  }

  return stats
}
