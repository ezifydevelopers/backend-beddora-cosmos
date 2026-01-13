import { Response, NextFunction } from 'express'
import { AuthRequest } from './auth.middleware'

/**
 * Role-based access control middleware
 * Checks if user has required role(s)
 * 
 * Usage:
 * router.get('/admin', authenticate, requireRole('admin'), controller.handler)
 * router.get('/admin', authenticate, requireRoles(['admin', 'superadmin']), controller.handler)
 */

/**
 * Require a single role
 */
export function requireRole(role: string) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }

    if (!req.user.roles.includes(role)) {
      res.status(403).json({ error: `Access denied. Required role: ${role}` })
      return
    }

    next()
  }
}

/**
 * Require any of the specified roles
 */
export function requireRoles(roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }

    const hasRole = roles.some((role) => req.user?.roles.includes(role))

    if (!hasRole) {
      res.status(403).json({ error: `Access denied. Required roles: ${roles.join(', ')}` })
      return
    }

    next()
  }
}

/**
 * Require all of the specified roles
 */
export function requireAllRoles(roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }

    const hasAllRoles = roles.every((role) => req.user?.roles.includes(role))

    if (!hasAllRoles) {
      res.status(403).json({ error: `Access denied. Required all roles: ${roles.join(', ')}` })
      return
    }

    next()
  }
}

