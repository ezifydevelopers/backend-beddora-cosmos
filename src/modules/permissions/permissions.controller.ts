import { Response, NextFunction } from 'express'
import { AuthRequest } from '../../middlewares/auth.middleware'
import * as permissionsService from './permissions.service'

/**
 * Permissions controller
 */

export async function getMyPermissions(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const accountId = req.query.accountId as string | undefined
    const result = await permissionsService.getUserPermissions(req.userId, accountId)
    res.status(200).json(result)
  } catch (error) {
    next(error)
  }
}

export async function updateUserPermissions(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const { userId } = req.params
    const { permissions } = req.body

    const result = await permissionsService.updateUserPermissions(req.userId, userId, permissions)
    res.status(200).json(result)
  } catch (error) {
    next(error)
  }
}
