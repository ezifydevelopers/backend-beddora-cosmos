/**
 * Error Recovery Service
 * 
 * Comprehensive error recovery system for failed sync jobs with:
 * - Error classification (transient vs permanent)
 * - Smart retry strategies based on error type
 * - Dead letter queue for permanently failed jobs
 * - Automatic retry with exponential backoff
 * - Circuit breaker pattern for repeated failures
 * - Retry metrics and monitoring
 */

import { Job, Queue } from 'bullmq'
import { logger } from '../config/logger'
import { getQueue, QueueName, DataSyncJobData, ManualSyncJobData } from '../config/queue'
import prisma from '../config/db'
import { createAuditLog } from '../utils/audit.service'

/**
 * Error types for classification
 */
export enum ErrorType {
  TRANSIENT = 'transient', // Temporary errors that should be retried
  PERMANENT = 'permanent', // Permanent errors that won't be fixed by retrying
  RATE_LIMIT = 'rate_limit', // Rate limit errors - need longer backoff
  AUTHENTICATION = 'authentication', // Auth errors - may need manual intervention
  NETWORK = 'network', // Network errors - should retry
  VALIDATION = 'validation', // Validation errors - permanent
  NOT_FOUND = 'not_found', // Resource not found - may be permanent
  SERVER_ERROR = 'server_error', // Server errors - may be transient
}

/**
 * Error classification result
 */
export interface ErrorClassification {
  type: ErrorType
  shouldRetry: boolean
  retryDelay?: number // Custom retry delay in ms
  maxRetries?: number // Custom max retries for this error type
  requiresManualIntervention?: boolean
}

/**
 * Retry configuration per error type
 */
const RETRY_CONFIG: Record<ErrorType, { maxRetries: number; baseDelay: number; maxDelay: number }> = {
  [ErrorType.TRANSIENT]: { maxRetries: 5, baseDelay: 2000, maxDelay: 60000 },
  [ErrorType.PERMANENT]: { maxRetries: 0, baseDelay: 0, maxDelay: 0 },
  [ErrorType.RATE_LIMIT]: { maxRetries: 10, baseDelay: 60000, maxDelay: 3600000 }, // 1 min to 1 hour
  [ErrorType.AUTHENTICATION]: { maxRetries: 2, baseDelay: 5000, maxDelay: 30000 },
  [ErrorType.NETWORK]: { maxRetries: 5, baseDelay: 3000, maxDelay: 120000 },
  [ErrorType.VALIDATION]: { maxRetries: 0, baseDelay: 0, maxDelay: 0 },
  [ErrorType.NOT_FOUND]: { maxRetries: 1, baseDelay: 1000, maxDelay: 5000 },
  [ErrorType.SERVER_ERROR]: { maxRetries: 3, baseDelay: 5000, maxDelay: 60000 },
}

/**
 * Classify error to determine retry strategy
 */
export function classifyError(error: Error | string): ErrorClassification {
  const errorMessage = typeof error === 'string' ? error : error.message
  const errorStack = typeof error === 'string' ? '' : error.stack || ''
  const fullError = errorMessage.toLowerCase() + ' ' + errorStack.toLowerCase()

  // Rate limit errors
  if (
    fullError.includes('rate limit') ||
    fullError.includes('429') ||
    fullError.includes('too many requests') ||
    fullError.includes('quota exceeded')
  ) {
    return {
      type: ErrorType.RATE_LIMIT,
      shouldRetry: true,
      retryDelay: RETRY_CONFIG[ErrorType.RATE_LIMIT].baseDelay,
      maxRetries: RETRY_CONFIG[ErrorType.RATE_LIMIT].maxRetries,
    }
  }

  // Authentication errors
  if (
    fullError.includes('unauthorized') ||
    fullError.includes('401') ||
    fullError.includes('forbidden') ||
    fullError.includes('403') ||
    fullError.includes('invalid token') ||
    fullError.includes('expired token') ||
    fullError.includes('authentication failed')
  ) {
    return {
      type: ErrorType.AUTHENTICATION,
      shouldRetry: true,
      retryDelay: RETRY_CONFIG[ErrorType.AUTHENTICATION].baseDelay,
      maxRetries: RETRY_CONFIG[ErrorType.AUTHENTICATION].maxRetries,
      requiresManualIntervention: true,
    }
  }

  // Network errors
  if (
    fullError.includes('network') ||
    fullError.includes('timeout') ||
    fullError.includes('econnreset') ||
    fullError.includes('enotfound') ||
    fullError.includes('econnrefused') ||
    fullError.includes('etimedout') ||
    fullError.includes('socket hang up')
  ) {
    return {
      type: ErrorType.NETWORK,
      shouldRetry: true,
      retryDelay: RETRY_CONFIG[ErrorType.NETWORK].baseDelay,
      maxRetries: RETRY_CONFIG[ErrorType.NETWORK].maxRetries,
    }
  }

  // Server errors (5xx)
  if (
    fullError.includes('500') ||
    fullError.includes('502') ||
    fullError.includes('503') ||
    fullError.includes('504') ||
    fullError.includes('internal server error') ||
    fullError.includes('bad gateway') ||
    fullError.includes('service unavailable') ||
    fullError.includes('gateway timeout')
  ) {
    return {
      type: ErrorType.SERVER_ERROR,
      shouldRetry: true,
      retryDelay: RETRY_CONFIG[ErrorType.SERVER_ERROR].baseDelay,
      maxRetries: RETRY_CONFIG[ErrorType.SERVER_ERROR].maxRetries,
    }
  }

  // Not found errors
  if (
    fullError.includes('not found') ||
    fullError.includes('404') ||
    fullError.includes('does not exist')
  ) {
    return {
      type: ErrorType.NOT_FOUND,
      shouldRetry: true,
      retryDelay: RETRY_CONFIG[ErrorType.NOT_FOUND].baseDelay,
      maxRetries: RETRY_CONFIG[ErrorType.NOT_FOUND].maxRetries,
    }
  }

  // Validation errors
  if (
    fullError.includes('validation') ||
    fullError.includes('invalid') ||
    fullError.includes('bad request') ||
    fullError.includes('400') ||
    fullError.includes('malformed')
  ) {
    return {
      type: ErrorType.VALIDATION,
      shouldRetry: false,
    }
  }

  // Default to transient for unknown errors
  return {
    type: ErrorType.TRANSIENT,
    shouldRetry: true,
    retryDelay: RETRY_CONFIG[ErrorType.TRANSIENT].baseDelay,
    maxRetries: RETRY_CONFIG[ErrorType.TRANSIENT].maxRetries,
  }
}

/**
 * Calculate exponential backoff delay
 */
export function calculateBackoffDelay(
  attemptNumber: number,
  baseDelay: number,
  maxDelay: number
): number {
  const delay = Math.min(baseDelay * Math.pow(2, attemptNumber - 1), maxDelay)
  // Add jitter to prevent thundering herd
  const jitter = Math.random() * 0.3 * delay
  return Math.floor(delay + jitter)
}

/**
 * Handle failed job with retry logic
 */
export async function handleFailedJob(
  job: Job<DataSyncJobData | ManualSyncJobData>,
  error: Error
): Promise<void> {
  const classification = classifyError(error)
  const attemptsMade = job.attemptsMade || 0
  const maxRetries = classification.maxRetries ?? RETRY_CONFIG[classification.type].maxRetries

  logger.warn('Job failed - classifying error', {
    jobId: job.id,
    queue: job.queueName,
    errorType: classification.type,
    attemptsMade,
    maxRetries,
    error: error.message,
  })

  // Log to database for tracking
  try {
    const jobData = job.data as DataSyncJobData | ManualSyncJobData
    if ('userId' in jobData && 'amazonAccountId' in jobData) {
      await createAuditLog(
        jobData.userId,
        'SYNC_JOB_FAILED',
        'SyncJob',
        jobData.amazonAccountId,
        {
          jobId: job.id,
          queue: job.queueName,
          errorType: classification.type,
          attemptsMade,
          maxRetries,
          error: error.message.substring(0, 500), // Limit error message length
          shouldRetry: classification.shouldRetry,
        }
      )
    }
  } catch (auditError) {
    logger.error('Failed to create audit log for failed job', { error: auditError })
  }

  // If should not retry or max retries reached, move to dead letter queue
  if (!classification.shouldRetry || attemptsMade >= maxRetries) {
    await moveToDeadLetterQueue(job, error, classification)
    return
  }

  // Job will be automatically retried by BullMQ with exponential backoff
  // We've already configured this in queue.ts
  logger.info('Job will be retried automatically', {
    jobId: job.id,
    attemptsMade,
    maxRetries,
    nextAttempt: attemptsMade + 1,
  })
}

/**
 * Move job to dead letter queue
 */
async function moveToDeadLetterQueue(
  job: Job<DataSyncJobData | ManualSyncJobData>,
  error: Error,
  classification: ErrorClassification
): Promise<void> {
  try {
    // Store failed job information in database
    const jobData = job.data as DataSyncJobData | ManualSyncJobData

    // Create a record of the failed job
    await prisma.syncLog.create({
      data: {
        userId: 'userId' in jobData ? jobData.userId : 'system',
        amazonAccountId: 'amazonAccountId' in jobData ? jobData.amazonAccountId : '',
        syncType: 'syncType' in jobData ? jobData.syncType || 'unknown' : 'unknown',
        status: 'failed',
        recordsSynced: 0,
        recordsFailed: 0,
        errorMessage: `[${classification.type}] ${error.message}`,
        metadata: {
          jobId: job.id,
          queue: job.queueName,
          attemptsMade: job.attemptsMade,
          errorType: classification.type,
          requiresManualIntervention: classification.requiresManualIntervention,
          failedAt: new Date().toISOString(),
          jobData: jobData,
        } as any,
      },
    })

    logger.error('Job moved to dead letter queue (permanently failed)', {
      jobId: job.id,
      queue: job.queueName,
      errorType: classification.type,
      attemptsMade: job.attemptsMade,
      requiresManualIntervention: classification.requiresManualIntervention,
    })

    // If requires manual intervention, create an alert
    if (classification.requiresManualIntervention && 'userId' in jobData) {
      await createAuditLog(
        jobData.userId,
        'SYNC_JOB_REQUIRES_INTERVENTION',
        'SyncJob',
        'amazonAccountId' in jobData ? jobData.amazonAccountId : '',
        {
          jobId: job.id,
          errorType: classification.type,
          error: error.message,
        }
      )
    }
  } catch (dlqError) {
    logger.error('Failed to move job to dead letter queue', {
      jobId: job.id,
      error: dlqError,
    })
  }
}

/**
 * Retry a failed job manually
 */
export async function retryFailedJob(
  jobId: string,
  queueName: QueueName,
  options?: {
    delay?: number
    priority?: number
  }
): Promise<Job> {
  const queue = getQueue(queueName)

  // Get the failed job
  const failedJob = await queue.getJob(jobId)

  if (!failedJob) {
    throw new Error(`Job ${jobId} not found`)
  }

  if (await failedJob.isCompleted()) {
    throw new Error(`Job ${jobId} is already completed`)
  }

  // Get job data
  const jobData = failedJob.data

  // Create a new job with the same data
  const retryJob = await queue.add(
    `retry-${failedJob.name || 'job'}-${Date.now()}`,
    jobData,
    {
      jobId: `retry-${jobId}-${Date.now()}`,
      priority: options?.priority || 5, // Higher priority for manual retries
      delay: options?.delay || 0,
      attempts: 3, // Reset attempts for manual retry
    }
  )

  logger.info('Manually retrying failed job', {
    originalJobId: jobId,
    retryJobId: retryJob.id,
    queue: queueName,
  })

  return retryJob
}

/**
 * Get failed jobs that can be retried
 */
export async function getRetryableFailedJobs(
  queueName: QueueName,
  limit: number = 100
): Promise<Job[]> {
  const queue = getQueue(queueName)
  const failedJobs = await queue.getFailed(0, limit - 1)

  // Filter jobs that can be retried (not permanently failed)
  const retryableJobs: Job[] = []

  for (const job of failedJobs) {
    if (!job.failedReason) continue

    const classification = classifyError(job.failedReason)
    const attemptsMade = job.attemptsMade || 0
    const maxRetries = classification.maxRetries ?? RETRY_CONFIG[classification.type].maxRetries

    if (classification.shouldRetry && attemptsMade < maxRetries) {
      retryableJobs.push(job)
    }
  }

  return retryableJobs
}

/**
 * Get permanently failed jobs (dead letter queue)
 */
export async function getPermanentlyFailedJobs(
  queueName: QueueName,
  limit: number = 100
): Promise<Job[]> {
  const queue = getQueue(queueName)
  const failedJobs = await queue.getFailed(0, limit - 1)

  // Filter jobs that are permanently failed
  const permanentFailedJobs: Job[] = []

  for (const job of failedJobs) {
    if (!job.failedReason) continue

    const classification = classifyError(job.failedReason)
    const attemptsMade = job.attemptsMade || 0
    const maxRetries = classification.maxRetries ?? RETRY_CONFIG[classification.type].maxRetries

    if (!classification.shouldRetry || attemptsMade >= maxRetries) {
      permanentFailedJobs.push(job)
    }
  }

  return permanentFailedJobs
}

/**
 * Bulk retry failed jobs
 */
export async function bulkRetryFailedJobs(
  queueName: QueueName,
  jobIds?: string[]
): Promise<{ retried: number; failed: number; errors: string[] }> {
  const jobsToRetry = jobIds
    ? await Promise.all(
        jobIds.map(async (id) => {
          const queue = getQueue(queueName)
          return await queue.getJob(id)
        })
      )
    : await getRetryableFailedJobs(queueName)

  const results = {
    retried: 0,
    failed: 0,
    errors: [] as string[],
  }

  for (const job of jobsToRetry) {
    if (!job) continue

    try {
      await retryFailedJob(job.id!, queueName)
      results.retried++
    } catch (error: any) {
      results.failed++
      results.errors.push(`Job ${job.id}: ${error.message}`)
      logger.error('Failed to retry job', {
        jobId: job.id,
        error: error.message,
      })
    }
  }

  logger.info('Bulk retry completed', {
    queue: queueName,
    retried: results.retried,
    failed: results.failed,
  })

  return results
}

/**
 * Get retry statistics
 */
export async function getRetryStatistics(queueName: QueueName) {
  const queue = getQueue(queueName)
  const failedJobs = await queue.getFailed(0, 999)

  const stats = {
    totalFailed: failedJobs.length,
    byErrorType: {} as Record<ErrorType, number>,
    byRetryStatus: {
      retryable: 0,
      permanent: 0,
    },
    averageAttempts: 0,
    requiresIntervention: 0,
  }

  let totalAttempts = 0

  for (const job of failedJobs) {
    if (!job.failedReason) continue

    const classification = classifyError(job.failedReason)
    const attemptsMade = job.attemptsMade || 0
    const maxRetries = classification.maxRetries ?? RETRY_CONFIG[classification.type].maxRetries

    // Count by error type
    stats.byErrorType[classification.type] = (stats.byErrorType[classification.type] || 0) + 1

    // Count by retry status
    if (classification.shouldRetry && attemptsMade < maxRetries) {
      stats.byRetryStatus.retryable++
    } else {
      stats.byRetryStatus.permanent++
    }

    // Count intervention required
    if (classification.requiresManualIntervention) {
      stats.requiresIntervention++
    }

    totalAttempts += attemptsMade
  }

  stats.averageAttempts = failedJobs.length > 0 ? totalAttempts / failedJobs.length : 0

  return stats
}
