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
    const { permissions, roles } = req.body

    const result = await permissionsService.updateUserPermissions(req.userId, userId, permissions || [], roles)
    res.status(200).json(result)
  } catch (error) {
    next(error)
  }
}

export async function listRoles(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const roles = await permissionsService.listRoles()
    res.status(200).json(roles)
  } catch (error) {
    next(error)
  }
}

export async function createRole(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { name, description } = req.body
    const role = await permissionsService.createRole(name, description)
    res.status(201).json(role)
  } catch (error) {
    next(error)
  }
}

export async function createPermission(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { name, resource, action, scope, description } = req.body
    const perm = await permissionsService.createPermission({ name, resource, action, scope, description })
    res.status(201).json(perm)
  } catch (error) {
    next(error)
  }
}
