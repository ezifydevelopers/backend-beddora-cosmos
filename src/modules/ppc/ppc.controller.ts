import { Response, NextFunction } from 'express'
import { AuthRequest } from '../../middlewares/auth.middleware'
import * as ppcService from './ppc.service'

export async function getCampaigns(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    const result = await ppcService.getCampaigns(req.userId, req.query)
    res.status(200).json(result)
  } catch (error) {
    next(error)
  }
}

export async function getCampaignById(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    const { id } = req.params
    const result = await ppcService.getCampaignById(req.userId, id)
    res.status(200).json(result)
  } catch (error) {
    next(error)
  }
}

export async function updateCampaign(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    const { id } = req.params
    const result = await ppcService.updateCampaign(req.userId, id, req.body)
    res.status(200).json(result)
  } catch (error) {
    next(error)
  }
}

export async function getPPCPerformance(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    const result = await ppcService.getPPCPerformance(req.userId, req.query)
    res.status(200).json(result)
  } catch (error) {
    next(error)
  }
}

