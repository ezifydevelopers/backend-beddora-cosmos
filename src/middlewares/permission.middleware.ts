import { Response, NextFunction } from 'express'
import { AuthRequest } from './auth.middleware'
import * as permissionsService from '../modules/permissions/permissions.service'

/**
 * Permission-based access control middleware
 * Checks if user has required permission
 * 
 * Usage:
 * router.get('/profit', authenticate, requirePermission('profit', 'read'), controller.handler)
 */
export function requirePermission(resource: string, action: string) {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.userId) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }

    try {
      // Get accountId from token or query params
      const accountId = req.user?.accountId || (req.query.accountId as string) || undefined

      const hasAccess = await permissionsService.hasPermission(
        req.userId,
        resource,
        action,
        accountId
      )

      if (!hasAccess) {
        res.status(403).json({
          error: `Access denied. Required permission: ${resource}.${action}`,
        })
        return
      }

      next()
    } catch (error) {
      res.status(500).json({ error: 'Permission check failed' })
    }
  }
}
