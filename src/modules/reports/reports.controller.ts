import { Response, NextFunction } from 'express'
import { AuthRequest } from '../../middlewares/auth.middleware'
import * as reportsService from './reports.service'
import { ReportFilters, ReportFormat, ReportType, ScheduleReportRequest, UpdateScheduleRequest } from '../../types/reports.types'
import { logger } from '../../config/logger'

export async function exportReport(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const reportType = req.query.reportType as ReportType
    const format = req.query.format as ReportFormat
    const filters: ReportFilters = {
      accountId: req.query.accountId as string,
      amazonAccountId: req.query.amazonAccountId as string | undefined,
      marketplaceId: req.query.marketplaceId as string | undefined,
      sku: req.query.sku as string | undefined,
      campaignId: req.query.campaignId as string | undefined,
      startDate: req.query.startDate as string | undefined,
      endDate: req.query.endDate as string | undefined,
    }

    const result = await reportsService.exportReport(req.userId, reportType, format, filters)
    res.setHeader('Content-Type', result.mimeType)
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`)
    res.status(200).send(result.buffer)
  } catch (error: any) {
    logger.error('Failed to export report', { error, userId: req.userId })
    next(error)
  }
}

export async function listSchedules(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    const accountId = req.query.accountId as string
    const result = await reportsService.listSchedules(req.userId, accountId)
    res.status(200).json(result)
  } catch (error: any) {
    logger.error('Failed to list schedules', { error, userId: req.userId })
    next(error)
  }
}

export async function createSchedule(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    const payload = req.body as ScheduleReportRequest
    const result = await reportsService.createSchedule(req.userId, payload)
    res.status(201).json(result)
  } catch (error: any) {
    logger.error('Failed to create schedule', { error, userId: req.userId })
    next(error)
  }
}

export async function updateSchedule(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    const { id } = req.params
    const payload = req.body as UpdateScheduleRequest
    const result = await reportsService.updateSchedule(req.userId, id, payload)
    res.status(200).json(result)
  } catch (error: any) {
    logger.error('Failed to update schedule', { error, userId: req.userId })
    next(error)
  }
}

export async function deleteSchedule(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    const { id } = req.params
    const result = await reportsService.deleteSchedule(req.userId, id)
    res.status(200).json(result)
  } catch (error: any) {
    logger.error('Failed to delete schedule', { error, userId: req.userId })
    next(error)
  }
}

