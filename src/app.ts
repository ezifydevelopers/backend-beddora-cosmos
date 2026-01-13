import express, { Express } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
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

  // Security middleware
  app.use(helmet())

  // CORS configuration
  app.use(
    cors({
      origin: env.corsOrigin,
      credentials: true,
    })
  )

  // Body parsing middleware
  app.use(express.json({ limit: '10mb' }))
  app.use(express.urlencoded({ extended: true, limit: '10mb' }))

  // Logging middleware
  if (env.nodeEnv === 'development') {
    app.use(morgan('dev'))
  } else {
    app.use(morgan('combined', { stream: { write: (message) => logger.info(message.trim()) } }))
  }

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() })
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

