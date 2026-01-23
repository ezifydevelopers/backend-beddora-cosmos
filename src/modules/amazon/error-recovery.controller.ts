/**
 * Error Recovery Controller
 * 
 * API endpoints for managing failed sync jobs and retry operations
 */

import { Response, NextFunction } from 'express'
import { AuthRequest } from '../../middlewares/auth.middleware'
import { logger } from '../../config/logger'
import { AppError } from '../../middlewares/error.middleware'
import {
  retryFailedJob,
  getRetryableFailedJobs,
  getPermanentlyFailedJobs,
  bulkRetryFailedJobs,
  getRetryStatistics,
  classifyError,
} from '../../jobs/error-recovery.service'
import { QueueName } from '../../config/queue'
import prisma from '../../config/db'

/**
 * POST /api/amazon/error-recovery/retry/:jobId
 * Retry a specific failed job
 */
export async function retryJob(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const { jobId } = req.params
    const { queueName, delay, priority } = req.body

    if (!jobId) {
      res.status(400).json({ error: 'jobId is required' })
      return
    }

    const queue = queueName ? (QueueName[queueName as keyof typeof QueueName] as QueueName) : QueueName.DATA_SYNC

    const retryJob = await retryFailedJob(jobId, queue, {
      delay: delay ? parseInt(delay) : undefined,
      priority: priority ? parseInt(priority) : undefined,
    })

    res.status(200).json({
      success: true,
      message: 'Job queued for retry',
      job: {
        id: retryJob.id,
        name: retryJob.name,
        queue: queue,
      },
    })
  } catch (error: any) {
    logger.error('Failed to retry job', {
      error: error.message,
      userId: req.userId,
      jobId: req.params.jobId,
    })
    next(error)
  }
}

/**
 * GET /api/amazon/error-recovery/retryable
 * Get list of retryable failed jobs
 */
export async function getRetryableJobs(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const { queueName, limit } = req.query
    const queue = queueName
      ? (QueueName[queueName as keyof typeof QueueName] as QueueName)
      : QueueName.DATA_SYNC
    const limitNum = limit ? parseInt(limit as string) : 100

    const jobs = await getRetryableFailedJobs(queue, limitNum)

    const jobsData = await Promise.all(
      jobs.map(async (job) => {
        const classification = job.failedReason ? classifyError(job.failedReason) : null
        return {
          id: job.id,
          name: job.name,
          data: job.data,
          failedReason: job.failedReason,
          attemptsMade: job.attemptsMade,
          errorType: classification?.type,
          shouldRetry: classification?.shouldRetry,
          failedAt: job.finishedOn ? new Date(job.finishedOn) : null,
        }
      })
    )

    res.status(200).json({
      success: true,
      data: jobsData,
      count: jobsData.length,
    })
  } catch (error: any) {
    logger.error('Failed to get retryable jobs', {
      error: error.message,
      userId: req.userId,
    })
    next(error)
  }
}

/**
 * GET /api/amazon/error-recovery/permanent
 * Get list of permanently failed jobs (dead letter queue)
 */
export async function getPermanentFailedJobs(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const { queueName, limit } = req.query
    const queue = queueName
      ? (QueueName[queueName as keyof typeof QueueName] as QueueName)
      : QueueName.DATA_SYNC
    const limitNum = limit ? parseInt(limit as string) : 100

    const jobs = await getPermanentlyFailedJobs(queue, limitNum)

    const jobsData = await Promise.all(
      jobs.map(async (job) => {
        const classification = job.failedReason ? classifyError(job.failedReason) : null
        return {
          id: job.id,
          name: job.name,
          data: job.data,
          failedReason: job.failedReason,
          attemptsMade: job.attemptsMade,
          errorType: classification?.type,
          requiresIntervention: classification?.requiresManualIntervention,
          failedAt: job.finishedOn ? new Date(job.finishedOn) : null,
        }
      })
    )

    res.status(200).json({
      success: true,
      data: jobsData,
      count: jobsData.length,
    })
  } catch (error: any) {
    logger.error('Failed to get permanent failed jobs', {
      error: error.message,
      userId: req.userId,
    })
    next(error)
  }
}

/**
 * POST /api/amazon/error-recovery/bulk-retry
 * Bulk retry multiple failed jobs
 */
export async function bulkRetryJobs(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const { queueName, jobIds } = req.body

    if (!queueName) {
      res.status(400).json({ error: 'queueName is required' })
      return
    }

    const queue = QueueName[queueName as keyof typeof QueueName] as QueueName

    if (!queue) {
      res.status(400).json({ error: 'Invalid queue name' })
      return
    }

    const results = await bulkRetryFailedJobs(queue, jobIds)

    res.status(200).json({
      success: true,
      results,
    })
  } catch (error: any) {
    logger.error('Failed to bulk retry jobs', {
      error: error.message,
      userId: req.userId,
    })
    next(error)
  }
}

/**
 * GET /api/amazon/error-recovery/statistics
 * Get retry statistics
 */
export async function getStatistics(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const { queueName } = req.query
    const queue = queueName
      ? (QueueName[queueName as keyof typeof QueueName] as QueueName)
      : QueueName.DATA_SYNC

    const stats = await getRetryStatistics(queue)

    res.status(200).json({
      success: true,
      data: stats,
    })
  } catch (error: any) {
    logger.error('Failed to get retry statistics', {
      error: error.message,
      userId: req.userId,
    })
    next(error)
  }
}

/**
 * POST /api/amazon/error-recovery/classify-error
 * Classify an error to determine retry strategy
 */
export async function classifyErrorEndpoint(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const { error } = req.body

    if (!error) {
      res.status(400).json({ error: 'error is required' })
      return
    }

    const classification = classifyError(error)

    res.status(200).json({
      success: true,
      data: classification,
    })
  } catch (error: any) {
    logger.error('Failed to classify error', {
      error: error.message,
      userId: req.userId,
    })
    next(error)
  }
}
