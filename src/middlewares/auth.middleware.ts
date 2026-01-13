import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '../config/env'
import { logger } from '../config/logger'

/**
 * Extended Express Request with user information
 */
export interface AuthRequest extends Request {
  userId?: string
  user?: {
    id: string
    email: string
    roles: string[]
    accountId?: string
  }
}

/**
 * JWT Payload interface
 */
interface JWTPayload {
  userId: string
  email: string
  roles: string[]
  accountId?: string
}

/**
 * Authentication middleware
 * Validates JWT token and attaches user info to request
 * 
 * Usage: Add to protected routes
 * router.get('/protected', authenticate, controller.handler)
 */
export function authenticate(req: AuthRequest, res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'No token provided' })
      return
    }

    const token = authHeader.substring(7) // Remove 'Bearer ' prefix

    try {
      const decoded = jwt.verify(token, env.jwtSecret) as JWTPayload
      req.userId = decoded.userId
      req.user = {
        id: decoded.userId,
        email: decoded.email,
        roles: decoded.roles,
        accountId: decoded.accountId,
      }
      next()
    } catch (error) {
      logger.warn('Invalid token', { error })
      res.status(401).json({ error: 'Invalid or expired token' })
    }
  } catch (error) {
    logger.error('Authentication error', error)
    res.status(500).json({ error: 'Authentication failed' })
  }
}

/**
 * Optional authentication middleware
 * Attaches user info if token is present, but doesn't require it
 */
export function optionalAuthenticate(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  try {
    const authHeader = req.headers.authorization

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7)
      try {
        const decoded = jwt.verify(token, env.jwtSecret) as JWTPayload
        req.userId = decoded.userId
        req.user = {
          id: decoded.userId,
          email: decoded.email,
          roles: decoded.roles,
          accountId: decoded.accountId,
        }
      } catch (error) {
        // Token invalid, but continue without user
        logger.debug('Optional auth failed', { error })
      }
    }
    next()
  } catch (error) {
    next()
  }
}

