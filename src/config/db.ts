import { PrismaClient, Prisma } from '@prisma/client'
import { logger } from './logger'
import { PrismaQueryEvent, PrismaErrorEvent, PrismaWarnEvent } from '../types/common.types'

/**
 * Database configuration
 * Singleton Prisma client instance
 * 
 * Enterprise Best Practice:
 * - Single instance prevents connection pool exhaustion
 * - Event listeners for logging and monitoring
 * - Proper error handling and logging
 */

const prisma = new PrismaClient({
  log: [
    { level: 'query', emit: 'event' },
    { level: 'error', emit: 'event' },
    { level: 'warn', emit: 'event' },
  ],
})

// Log database queries in development
// Type-safe event handlers using Prisma event types
if (process.env.NODE_ENV === 'development') {
  prisma.$on('query', (e: Prisma.QueryEvent) => {
    const queryEvent: PrismaQueryEvent = {
      query: e.query,
      params: e.params,
      duration: e.duration,
      target: e.target,
    }
    logger.debug('Database Query', {
      query: queryEvent.query,
      duration: `${queryEvent.duration}ms`,
      params: queryEvent.params,
    })
  })
}

// Error event handler with proper typing
prisma.$on('error', (e: Prisma.LogEvent) => {
  const errorEvent: PrismaErrorEvent = {
    message: e.message,
    target: e.target,
  }
  logger.error('Database Error', errorEvent)
})

// Warning event handler with proper typing
prisma.$on('warn', (e: Prisma.LogEvent) => {
  const warnEvent: PrismaWarnEvent = {
    message: e.message,
    target: e.target,
  }
  logger.warn('Database Warning', warnEvent)
})

/**
 * Connect to database
 */
export async function connectDb(): Promise<void> {
  try {
    await prisma.$connect()
    logger.info('✅ Database connected successfully')
  } catch (error) {
    logger.error('❌ Database connection failed', error)
    throw error
  }
}

/**
 * Disconnect from database
 */
export async function disconnectDb(): Promise<void> {
  try {
    await prisma.$disconnect()
    logger.info('Database disconnected')
  } catch (error) {
    logger.error('Database disconnection error', error)
    throw error
  }
}

export default prisma

