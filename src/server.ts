import { createApp } from './app'
import { env } from './config/env'
import { logger } from './config/logger'
import { connectDb, disconnectDb } from './config/db'
import { verifyEmailConfig } from './config/mail'
import { startDataSyncJob } from './jobs/data-sync.job'
import { startReportsJob } from './jobs/reports.job'
import { startAlertsJob } from './jobs/alerts.job'

/**
 * Server entry point
 * Initializes database, email, and starts Express server
 */

async function startServer() {
  try {
    // Connect to database
    await connectDb()

    // Verify email configuration (non-blocking)
    await verifyEmailConfig()

    // Start background jobs
    startDataSyncJob()
    startReportsJob()
    startAlertsJob()

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

