import { Response, NextFunction } from 'express'
import { AuthRequest } from '../../middlewares/auth.middleware'
import * as autoresponderService from './autoresponder.service'

export async function getAutoresponders(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    const result = await autoresponderService.getAutoresponders(req.userId)
    res.status(200).json(result)
  } catch (error) {
    next(error)
  }
}

export async function createAutoresponder(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    const result = await autoresponderService.createAutoresponder(req.userId, req.body)
    res.status(201).json(result)
  } catch (error) {
    next(error)
  }
}

