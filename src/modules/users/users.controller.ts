import { Response, NextFunction } from 'express'
import { AuthRequest } from '../../middlewares/auth.middleware'
import * as usersService from './users.service'

/**
 * Users controller
 */

export async function getCurrentUser(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const result = await usersService.getCurrentUser(req.userId)
    res.status(200).json(result)
  } catch (error) {
    next(error)
  }
}

export async function updateCurrentUser(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const { name, email } = req.body
    const result = await usersService.updateCurrentUser(req.userId, { name, email })
    res.status(200).json(result)
  } catch (error) {
    next(error)
  }
}

export async function changePassword(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const { currentPassword, newPassword } = req.body
    const result = await usersService.changePassword(req.userId, currentPassword, newPassword)
    res.status(200).json(result)
  } catch (error) {
    next(error)
  }
}

export async function listUsers(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const result = await usersService.listUsers()
    res.status(200).json(result)
  } catch (error) {
    next(error)
  }
}