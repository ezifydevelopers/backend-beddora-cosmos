import { createApp } from './app'
import { env } from './config/env'
import { logger } from './config/logger'
import { connectDb, disconnectDb } from './config/db'
import { verifyEmailConfig } from './config/mail'
import { initializeRedis, closeRedis } from './config/redis'
import { runStartupValidations } from './config/startup-validation'
import { initializeQueues, closeQueues } from './config/queue'
import { initializeWorkers } from './jobs/workers'
import { initializeDataSyncScheduler, closeDataSyncScheduler } from './jobs/schedulers/data-sync.scheduler'
import { initializeReportsScheduler } from './jobs/schedulers/reports.scheduler'
import { initializeAlertsScheduler } from './jobs/schedulers/alerts.scheduler'

/**
 * Server entry point
 * Initializes database, email, and starts Express server
 * 
 * Implements fail-fast strategy for critical dependencies
 */

async function startServer() {
  try {
    // Run startup validations (fail-fast for critical issues)
    await runStartupValidations()

    // Connect to database
    await connectDb()

    // Initialize Redis (non-blocking, app works without it)
    await initializeRedis()

    // Initialize queue system (requires Redis)
    await initializeQueues()

    // Initialize workers (process jobs)
    initializeWorkers()

    // Initialize schedulers (schedule recurring jobs)
    await initializeDataSyncScheduler()
    await initializeReportsScheduler()
    await initializeAlertsScheduler()

    // Verify email configuration (non-blocking)
    await verifyEmailConfig()

    // Create Express app
    const app = createApp()

    // Start server
    const server = app.listen(env.port, () => {
      logger.info(`🚀 Server running on port ${env.port}`)
      logger.info(`📝 Environment: ${env.nodeEnv}`)
      logger.info(`🔗 API: http://localhost:${env.port}${env.apiPrefix}`)
    })

    // Graceful shutdown
    const shutdown = async () => {
      logger.info('Shutting down server...')
      server.close(async () => {
        // Close queues and workers first (let current jobs finish)
        await closeDataSyncScheduler()
        await closeQueues()
        await closeRedis()
        await disconnectDb()
        process.exit(0)
      })
    }

    process.on('SIGTERM', shutdown)
    process.on('SIGINT', shutdown)
  } catch (error) {
    logger.error('Failed to start server', error)
    process.exit(1)
  }
}

startServer()

