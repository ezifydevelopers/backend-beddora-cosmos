import cron from 'node-cron'
import { logger } from '../config/logger'

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
      // TODO: Implement report generation logic
      // 1. Get all scheduled reports
      // 2. Generate reports
      // 3. Send reports via email or store in database

      logger.info('Reports generation job completed')
    } catch (error) {
      logger.error('Reports generation job failed', error)
    }
  })

  logger.info('Reports generation job scheduled (runs daily at 2 AM)')
}

