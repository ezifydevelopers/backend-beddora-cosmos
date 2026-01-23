/**
 * Reports Job Processor
 * 
 * Processes report generation jobs from the queue
 */

import { Job } from 'bullmq'
import { logger } from '../../config/logger'
import { processScheduledReports } from '../../modules/reports/reports.scheduler'
import { ReportsJobData } from '../../config/queue'

/**
 * Process reports job
 */
export async function processReportsJob(job: Job<ReportsJobData>): Promise<void> {
  const { reportId, userId } = job.data

  logger.info(`Processing reports job`, {
    jobId: job.id,
    reportId,
    userId,
  })

  try {
    await job.updateProgress(10)

    // Process scheduled reports
    await processScheduledReports()

    await job.updateProgress(100)

    logger.info(`Reports job completed`, {
      jobId: job.id,
    })
  } catch (error: any) {
    logger.error(`Reports job failed`, {
      jobId: job.id,
      error: error.message,
      stack: error.stack,
    })

    throw error
  }
}
