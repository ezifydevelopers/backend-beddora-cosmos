import express, { Express } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import compression from 'compression'
import morgan from 'morgan'
import cookieParser from 'cookie-parser'
import { env } from './config/env'
import { logger } from './config/logger'
import { errorHandler } from './middlewares/error.middleware'
import { registerRoutes } from './routes'

/**
 * Express app setup
 * Configures middleware and routes
 */
export function createApp(): Express {
  const app = express()

  // Gzip compression for responses (reduces payload size)
  app.use(compression())

  // Security middleware
  app.use(helmet())

  // CORS configuration
  app.use(
    cors({
      origin: env.corsOrigin,
      credentials: true,
    })
  )

  // Parse cookies for auth/refresh workflows
  app.use(cookieParser())

  // Body parsing middleware
  app.use(express.json({ limit: '10mb' }))
  app.use(express.urlencoded({ extended: true, limit: '10mb' }))

  // Logging middleware
  if (env.nodeEnv === 'development') {
    app.use(morgan('dev'))
  } else {
    app.use(morgan('combined', { stream: { write: (message) => logger.info(message.trim()) } }))
  }

  // Health check endpoint with token validity checker
  app.get('/health', async (req, res) => {
    try {
      const healthStatus: any = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        services: {
          database: 'ok',
          redis: 'unknown',
        },
      }

      // Check database connection
      try {
        const prisma = (await import('./config/db')).default
        await prisma.$queryRaw`SELECT 1`
        healthStatus.services.database = 'ok'
      } catch (error) {
        healthStatus.services.database = 'error'
        healthStatus.status = 'degraded'
      }

      // Check Redis connection
      try {
        const { isRedisConnected } = await import('./config/redis')
        healthStatus.services.redis = isRedisConnected() ? 'ok' : 'unavailable'
      } catch (error) {
        healthStatus.services.redis = 'error'
      }

      // Check token validity (if amazonAccountId provided)
      const amazonAccountId = req.query.amazonAccountId as string | undefined
      if (amazonAccountId) {
        try {
          const { SPAPIWrapper } = await import('./modules/amazon/sp-api-wrapper.service')
          const client = new SPAPIWrapper(amazonAccountId)
          // Try to get a simple endpoint to verify token
          await client.get('/orders/v0/orders', { MarketplaceIds: ['ATVPDKIKX0DER'], MaxResultsPerPage: 1 })
          healthStatus.services.amazonToken = 'valid'
        } catch (error) {
          healthStatus.services.amazonToken = 'invalid'
          healthStatus.status = 'degraded'
        }
      }

      const statusCode = healthStatus.status === 'ok' ? 200 : 503
      res.status(statusCode).json(healthStatus)
    } catch (error) {
      res.status(503).json({
        status: 'error',
        timestamp: new Date().toISOString(),
        error: (error as Error).message,
      })
    }
  })

  // Register all API routes
  app.use(env.apiPrefix, registerRoutes())

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' })
  })

  // Error handling middleware (must be last)
  app.use(errorHandler)

  return app
}

