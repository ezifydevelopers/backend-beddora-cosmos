import { Response, NextFunction } from 'express'
import { AuthRequest } from '../../../middlewares/auth.middleware'
import * as chartsService from './charts.service'
import { ChartFilters } from '../../../types/charts.types'
import { logger } from '../../../config/logger'

export async function getProfitChart(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const filters: ChartFilters = {
      accountId: req.query.accountId as string | undefined,
      amazonAccountId: req.query.amazonAccountId as string | undefined,
      marketplaceId: req.query.marketplaceId as string | undefined,
      sku: req.query.sku as string | undefined,
      startDate: req.query.startDate as string | undefined,
      endDate: req.query.endDate as string | undefined,
      period: req.query.period as any,
    }

    const result = await chartsService.getProfitChart(filters, req.userId)
    res.status(200).json({ success: true, data: result })
  } catch (error: any) {
    logger.error('Failed to get profit chart', { error, userId: req.userId })
    next(error)
  }
}

export async function getSalesChart(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const filters: ChartFilters = {
      accountId: req.query.accountId as string | undefined,
      marketplaceId: req.query.marketplaceId as string | undefined,
      sku: req.query.sku as string | undefined,
      startDate: req.query.startDate as string | undefined,
      endDate: req.query.endDate as string | undefined,
      period: req.query.period as any,
    }

    const result = await chartsService.getSalesChart(filters, req.userId)
    res.status(200).json({ success: true, data: result })
  } catch (error: any) {
    logger.error('Failed to get sales chart', { error, userId: req.userId })
    next(error)
  }
}

export async function getPpcChart(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const filters: ChartFilters = {
      accountId: req.query.accountId as string | undefined,
      amazonAccountId: req.query.amazonAccountId as string | undefined,
      marketplaceId: req.query.marketplaceId as string | undefined,
      campaignId: req.query.campaignId as string | undefined,
      startDate: req.query.startDate as string | undefined,
      endDate: req.query.endDate as string | undefined,
      period: req.query.period as any,
    }

    const result = await chartsService.getPpcChart(filters, req.userId)
    res.status(200).json({ success: true, data: result })
  } catch (error: any) {
    logger.error('Failed to get PPC chart', { error, userId: req.userId })
    next(error)
  }
}

export async function getReturnsChart(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const filters: ChartFilters = {
      accountId: req.query.accountId as string | undefined,
      marketplaceId: req.query.marketplaceId as string | undefined,
      sku: req.query.sku as string | undefined,
      startDate: req.query.startDate as string | undefined,
      endDate: req.query.endDate as string | undefined,
      period: req.query.period as any,
    }

    const result = await chartsService.getReturnsChart(filters, req.userId)
    res.status(200).json({ success: true, data: result })
  } catch (error: any) {
    logger.error('Failed to get returns chart', { error, userId: req.userId })
    next(error)
  }
}

export async function getComparisonChart(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const filters: ChartFilters & { metric?: any } = {
      accountId: req.query.accountId as string | undefined,
      amazonAccountId: req.query.amazonAccountId as string | undefined,
      marketplaceId: req.query.marketplaceId as string | undefined,
      sku: req.query.sku as string | undefined,
      campaignId: req.query.campaignId as string | undefined,
      startDate: req.query.startDate as string | undefined,
      endDate: req.query.endDate as string | undefined,
      period: req.query.period as any,
      metric: req.query.metric as any,
    }

    const result = await chartsService.getComparisonChart(filters, req.userId)
    res.status(200).json({ success: true, data: result })
  } catch (error: any) {
    logger.error('Failed to get comparison chart', { error, userId: req.userId })
    next(error)
  }
}

export async function getDashboardChart(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const filters: ChartFilters = {
      accountId: req.query.accountId as string | undefined,
      marketplaceId: req.query.marketplaceId as string | undefined,
      startDate: req.query.startDate as string | undefined,
      endDate: req.query.endDate as string | undefined,
      period: (req.query.period as any) || 'month',
    }

    const result = await chartsService.getDashboardChart(filters, req.userId)
    res.status(200).json({ success: true, data: result })
  } catch (error: any) {
    logger.error('Failed to get dashboard chart', { error, userId: req.userId })
    next(error)
  }
}
