import { Response, NextFunction } from 'express'
import { AuthRequest } from './auth.middleware'
import * as permissionsService from '../modules/permissions/permissions.service'
import { ScopeType } from '../types/permission.types'

/**
 * Permission-based access control middleware
 * Checks if user has required permission
 * 
 * Usage:
 * router.get('/profit', authenticate, requirePermission('profit', 'read'), controller.handler)
 */
export function requirePermission(
  resource: string,
  action: string,
  options?: {
    scope?: ScopeType
    marketplaceParam?: string
    productParam?: string
  }
) {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.userId) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }

    try {
      const accountId = req.user?.accountId || (req.query.accountId as string) || undefined
      const marketplaceId =
        (options?.marketplaceParam && (req.params[options.marketplaceParam] as string)) ||
        (req.query.marketplaceId as string) ||
        undefined
      const productId =
        (options?.productParam && (req.params[options.productParam] as string)) ||
        (req.query.productId as string) ||
        undefined

      const hasAccess = await permissionsService.hasPermission({
        userId: req.userId,
        resource,
        action,
        accountId,
        marketplaceId,
        productId,
        scope: options?.scope,
      })

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
