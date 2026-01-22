import cron from 'node-cron'
import { logger } from '../config/logger'
import { processScheduledReports } from '../modules/reports/reports.scheduler'

/**
 * Reports Generation Job
 * Cron job to generate scheduled reports
 * 
 * Runs: Daily at 2 AM
 * Future microservice: Move to a separate reports-service
 */

export function startReportsJob() {
  // Run daily at 2 AM
  cron.schedule('0 2 * * *', async () => {
    logger.info('Starting reports generation job...')

    try {
      await processScheduledReports()

      logger.info('Reports generation job completed')
    } catch (error) {
      logger.error('Reports generation job failed', error)
    }
  })

  logger.info('Reports generation job scheduled (runs daily at 2 AM)')
}

