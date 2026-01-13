import { Request, Response, NextFunction } from 'express'
import { Prisma } from '@prisma/client'
import { logger } from '../config/logger'

/**
 * Custom error class for operational errors
 * 
 * Enterprise Best Practice:
 * - Distinguishes operational errors (expected) from programming errors
 * - Allows centralized error handling
 * - Includes HTTP status code for API responses
 */
export class AppError extends Error {
  statusCode: number
  isOperational: boolean

  constructor(message: string, statusCode: number = 500) {
    super(message)
    this.statusCode = statusCode
    this.isOperational = true
    Error.captureStackTrace(this, this.constructor)
  }
}

/**
 * Error handling middleware
 * Must be the last middleware in the chain
 * 
 * Handles:
 * - AppError instances (operational errors)
 * - Prisma errors (database errors)
 * - Validation errors
 * - Unknown errors
 */
export function errorHandler(
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Log error
  logger.error('Error occurred', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  })

  // Handle AppError (operational errors)
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.message,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    })
    return
  }

  // Handle Prisma errors with proper typing
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // P2002: Unique constraint violation (duplicate entry)
    if (err.code === 'P2002') {
      const target = (err.meta?.target as string[]) || []
      res.status(409).json({
        error: 'Duplicate entry',
        field: target.length > 0 ? target[0] : undefined,
      })
      return
    }
    // P2025: Record not found
    if (err.code === 'P2025') {
      res.status(404).json({ error: 'Record not found' })
      return
    }
    // P2003: Foreign key constraint violation
    if (err.code === 'P2003') {
      res.status(400).json({ error: 'Invalid reference' })
      return
    }
    // Default Prisma error
    res.status(400).json({ error: 'Database error', code: err.code })
    return
  }

  // Handle validation errors
  if (err.name === 'ValidationError') {
    res.status(400).json({ error: err.message })
    return
  }

  // Handle JWT errors
  if (err.name === 'JsonWebTokenError') {
    res.status(401).json({ error: 'Invalid token' })
    return
  }

  if (err.name === 'TokenExpiredError') {
    res.status(401).json({ error: 'Token expired' })
    return
  }

  // Default error response
  res.status(500).json({
    error: 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { message: err.message, stack: err.stack }),
  })
}

