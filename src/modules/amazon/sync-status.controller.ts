/**
 * Sync Status Controller
 * 
 * Handles sync job status and manual sync triggers
 * Uses BullMQ for job management
 */

import { Response, NextFunction } from 'express'
import { AuthRequest } from '../../middlewares/auth.middleware'
import { logger } from '../../config/logger'
import { AppError } from '../../middlewares/error.middleware'
import { getQueue, QueueName, ManualSyncJobData, getAllQueueStats } from '../../config/queue'
import { isRedisConnected } from '../../config/redis'
import prisma from '../../config/db'
import { Job } from 'bullmq'

/**
 * POST /amazon/sync/trigger
 * Manually trigger a sync job (queued for background processing)
 */
export async function triggerManualSync(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const { amazonAccountId, syncType, options } = req.body

    if (!amazonAccountId) {
      res.status(400).json({ error: 'amazonAccountId is required' })
      return
    }

    if (!syncType) {
      res.status(400).json({ error: 'syncType is required' })
      return
    }

    // Validate sync type
    const validSyncTypes = ['orders', 'fees', 'ppc', 'inventory', 'listings', 'refunds', 'all']
    if (!validSyncTypes.includes(syncType)) {
      res.status(400).json({ 
        error: `Invalid syncType. Must be one of: ${validSyncTypes.join(', ')}` 
      })
      return
    }

    // Verify account belongs to user
    const account = await prisma.amazonAccount.findUnique({
      where: { id: amazonAccountId },
      select: { userId: true, isActive: true },
    })

    if (!account) {
      res.status(404).json({ error: 'Amazon account not found' })
      return
    }

    if (account.userId !== req.userId) {
      res.status(403).json({ error: 'Access denied' })
      return
    }

    if (!account.isActive) {
      res.status(400).json({ error: 'Amazon account is not active' })
      return
    }

    // Check if Redis/queue system is available
    if (!isRedisConnected()) {
      // Fallback to direct sync if queue is unavailable
      logger.warn('Queue system unavailable, falling back to direct sync', {
        amazonAccountId,
        syncType,
      })
      
      const syncService = await import('./sync.service')
      let result: any

      switch (syncType) {
        case 'orders':
          result = await syncService.syncOrders(req.userId, amazonAccountId, options)
          break
        case 'fees':
          result = await syncService.syncFees(req.userId, amazonAccountId, options)
          break
        case 'ppc':
          result = await syncService.syncPPC(req.userId, amazonAccountId, options)
          break
        case 'inventory':
          result = await syncService.syncInventory(req.userId, amazonAccountId, options)
          break
        case 'listings':
          result = await syncService.syncListings(req.userId, amazonAccountId, options)
          break
        case 'refunds':
          result = await syncService.syncRefunds(req.userId, amazonAccountId, options)
          break
        case 'all':
          // Run all syncs sequentially
          await syncService.syncOrders(req.userId, amazonAccountId, options)
          await syncService.syncFees(req.userId, amazonAccountId, options)
          await syncService.syncPPC(req.userId, amazonAccountId, options)
          await syncService.syncInventory(req.userId, amazonAccountId, options)
          await syncService.syncListings(req.userId, amazonAccountId, options)
          result = await syncService.syncRefunds(req.userId, amazonAccountId, options)
          break
        default:
          res.status(400).json({ error: `Invalid syncType: ${syncType}` })
          return
      }

      res.status(200).json({
        success: true,
        message: 'Sync completed (direct mode - queue unavailable)',
        data: result,
        queueMode: false,
      })
      return
    }

    // Queue the sync job
    const queue = getQueue<ManualSyncJobData>(QueueName.MANUAL_SYNC)
    
    const job = await queue.add(
      `manual-sync-${syncType}-${amazonAccountId}`,
      {
        amazonAccountId,
        userId: req.userId,
        syncType,
        options: options || {},
      },
      {
        jobId: `manual-sync-${amazonAccountId}-${syncType}-${Date.now()}`,
        priority: 10, // High priority for manual syncs
        removeOnComplete: {
          age: 24 * 3600, // Keep for 24 hours
          count: 100, // Keep last 100 manual syncs
        },
      }
    )

    logger.info('Manual sync job queued', {
      jobId: job.id,
      amazonAccountId,
      userId: req.userId,
      syncType,
    })

    res.status(202).json({
      success: true,
      message: 'Sync job queued',
      data: {
        jobId: job.id,
        status: 'queued',
        syncType,
        amazonAccountId,
        estimatedCompletion: 'Processing in background',
      },
      queueMode: true,
    })
  } catch (error: any) {
    logger.error('Failed to trigger manual sync', {
      error: error.message,
      userId: req.userId,
    })
    next(error)
  }
}

/**
 * GET /amazon/sync/status/:jobId
 * Get status of a sync job
 */
export async function getSyncJobStatus(
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

    if (!jobId) {
      res.status(400).json({ error: 'jobId is required' })
      return
    }

    if (!isRedisConnected()) {
      res.status(503).json({ 
        error: 'Queue system unavailable',
        message: 'Redis is not connected. Cannot check job status.',
      })
      return
    }

    const queue = getQueue<ManualSyncJobData>(QueueName.MANUAL_SYNC)
    const job = await queue.getJob(jobId)

    if (!job) {
      res.status(404).json({ error: 'Job not found' })
      return
    }

    // Verify job belongs to user
    if (job.data.userId !== req.userId) {
      res.status(403).json({ error: 'Access denied' })
      return
    }

    const state = await job.getState()
    const progress = job.progress || 0
    const returnValue = job.returnvalue
    const failedReason = job.failedReason

    // Get job timing information
    const processedOn = job.processedOn
    const finishedOn = job.finishedOn
    const timestamp = job.timestamp

    res.status(200).json({
      success: true,
      data: {
        jobId: job.id,
        status: state,
        progress,
        syncType: job.data.syncType,
        amazonAccountId: job.data.amazonAccountId,
        options: job.data.options,
        createdAt: timestamp ? new Date(timestamp).toISOString() : null,
        startedAt: processedOn ? new Date(processedOn).toISOString() : null,
        completedAt: finishedOn ? new Date(finishedOn).toISOString() : null,
        duration: finishedOn && processedOn 
          ? finishedOn - processedOn 
          : processedOn && timestamp 
            ? processedOn - timestamp 
            : null,
        result: returnValue || null,
        error: failedReason || null,
        attemptsMade: job.attemptsMade || 0,
      },
    })
  } catch (error: any) {
    logger.error('Failed to get sync job status', {
      error: error.message,
      jobId: req.params.jobId,
      userId: req.userId,
    })
    next(error)
  }
}

/**
 * GET /amazon/sync/status
 * Get sync status for an account (latest jobs)
 */
export async function getAccountSyncStatus(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const { amazonAccountId, limit = '10' } = req.query

    if (!amazonAccountId) {
      res.status(400).json({ error: 'amazonAccountId is required' })
      return
    }

    // Verify account belongs to user
    const account = await prisma.amazonAccount.findUnique({
      where: { id: amazonAccountId as string },
      select: { userId: true },
    })

    if (!account) {
      res.status(404).json({ error: 'Amazon account not found' })
      return
    }

    if (account.userId !== req.userId) {
      res.status(403).json({ error: 'Access denied' })
      return
    }

    if (!isRedisConnected()) {
      res.status(503).json({ 
        error: 'Queue system unavailable',
        message: 'Redis is not connected. Cannot check job status.',
      })
      return
    }

    const queue = getQueue<ManualSyncJobData>(QueueName.MANUAL_SYNC)
    const limitNum = parseInt(limit as string, 10) || 10

    // Get jobs for this account
    // Note: BullMQ doesn't have a direct way to filter by data field
    // We'll get recent jobs and filter client-side
    const [waiting, active, completed, failed] = await Promise.all([
      queue.getWaiting(0, 100),
      queue.getActive(0, 100),
      queue.getCompleted(0, 100),
      queue.getFailed(0, 100),
    ])

    // Filter jobs by account and user
    const allJobs = [...waiting, ...active, ...completed, ...failed]
    const accountJobs = allJobs
      .filter((job) => 
        job.data.amazonAccountId === amazonAccountId && 
        job.data.userId === req.userId
      )
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
      .slice(0, limitNum)

    // Get status for each job
    const jobsWithStatus = await Promise.all(
      accountJobs.map(async (job) => {
        const state = await job.getState()
        return {
          jobId: job.id,
          status: state,
          progress: job.progress || 0,
          syncType: job.data.syncType,
          createdAt: job.timestamp ? new Date(job.timestamp).toISOString() : null,
          startedAt: job.processedOn ? new Date(job.processedOn).toISOString() : null,
          completedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
          error: job.failedReason || null,
        }
      })
    )

    res.status(200).json({
      success: true,
      data: {
        amazonAccountId,
        jobs: jobsWithStatus,
        total: jobsWithStatus.length,
      },
    })
  } catch (error: any) {
    logger.error('Failed to get account sync status', {
      error: error.message,
      amazonAccountId: req.query.amazonAccountId,
      userId: req.userId,
    })
    next(error)
  }
}

/**
 * GET /amazon/sync/queue-stats
 * Get queue statistics
 */
export async function getQueueStatistics(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    if (!isRedisConnected()) {
      res.status(503).json({ 
        error: 'Queue system unavailable',
        message: 'Redis is not connected.',
      })
      return
    }

    const stats = await getAllQueueStats()

    res.status(200).json({
      success: true,
      data: stats,
    })
  } catch (error: any) {
    logger.error('Failed to get queue statistics', {
      error: error.message,
      userId: req.userId,
    })
    next(error)
  }
}

/**
 * DELETE /amazon/sync/cancel/:jobId
 * Cancel a sync job
 */
export async function cancelSyncJob(
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

    if (!jobId) {
      res.status(400).json({ error: 'jobId is required' })
      return
    }

    if (!isRedisConnected()) {
      res.status(503).json({ 
        error: 'Queue system unavailable',
        message: 'Redis is not connected. Cannot cancel job.',
      })
      return
    }

    const queue = getQueue<ManualSyncJobData>(QueueName.MANUAL_SYNC)
    const job = await queue.getJob(jobId)

    if (!job) {
      res.status(404).json({ error: 'Job not found' })
      return
    }

    // Verify job belongs to user
    if (job.data.userId !== req.userId) {
      res.status(403).json({ error: 'Access denied' })
      return
    }

    const state = await job.getState()

    // Only cancel if job is waiting or active
    if (state === 'completed' || state === 'failed') {
      res.status(400).json({ 
        error: 'Job cannot be cancelled',
        message: `Job is already ${state}`,
      })
      return
    }

    await job.remove()

    logger.info('Sync job cancelled', {
      jobId,
      userId: req.userId,
    })

    res.status(200).json({
      success: true,
      message: 'Job cancelled',
      data: {
        jobId,
        status: 'cancelled',
      },
    })
  } catch (error: any) {
    logger.error('Failed to cancel sync job', {
      error: error.message,
      jobId: req.params.jobId,
      userId: req.userId,
    })
    next(error)
  }
}
