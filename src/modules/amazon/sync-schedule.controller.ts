/**
 * Sync Schedule Controller
 * 
 * API endpoints for managing per-account sync schedules
 */

import { Response, NextFunction } from 'express'
import { AuthRequest } from '../../middlewares/auth.middleware'
import { logger } from '../../config/logger'
import { AppError } from '../../middlewares/error.middleware'
import * as syncScheduleService from './sync-schedule.service'

/**
 * GET /amazon/sync-schedule/:amazonAccountId
 * Get sync schedule for an account
 */
export async function getSyncSchedule(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const { amazonAccountId } = req.params

    if (!amazonAccountId) {
      res.status(400).json({ error: 'amazonAccountId is required' })
      return
    }

    const schedules = await syncScheduleService.getSyncSchedule(req.userId, amazonAccountId)

    res.status(200).json({
      success: true,
      data: schedules,
    })
  } catch (error: any) {
    logger.error('Failed to get sync schedule', {
      error: error.message,
      amazonAccountId: req.params.amazonAccountId,
      userId: req.userId,
    })
    next(error)
  }
}

/**
 * PUT /amazon/sync-schedule/:amazonAccountId/:syncType
 * Update sync schedule for a specific sync type
 */
export async function updateSyncSchedule(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const { amazonAccountId, syncType } = req.params
    const { intervalMinutes, enabled } = req.body

    if (!amazonAccountId || !syncType) {
      res.status(400).json({ error: 'amazonAccountId and syncType are required' })
      return
    }

    if (intervalMinutes === undefined || enabled === undefined) {
      res.status(400).json({ error: 'intervalMinutes and enabled are required' })
      return
    }

    // Validate interval
    const validIntervals = Object.values(syncScheduleService.SYNC_INTERVALS)
    if (!validIntervals.includes(intervalMinutes)) {
      res.status(400).json({
        error: `Invalid intervalMinutes. Must be one of: ${validIntervals.join(', ')}`,
      })
      return
    }

    // Validate sync type
    const validSyncTypes = ['orders', 'fees', 'ppc', 'inventory', 'listings', 'refunds']
    if (!validSyncTypes.includes(syncType)) {
      res.status(400).json({
        error: `Invalid syncType. Must be one of: ${validSyncTypes.join(', ')}`,
      })
      return
    }

    const schedule = await syncScheduleService.updateSyncSchedule(
      req.userId,
      amazonAccountId,
      syncType as any,
      {
        intervalMinutes,
        enabled: Boolean(enabled),
      }
    )

    res.status(200).json({
      success: true,
      message: 'Sync schedule updated',
      data: schedule,
    })
  } catch (error: any) {
    logger.error('Failed to update sync schedule', {
      error: error.message,
      amazonAccountId: req.params.amazonAccountId,
      syncType: req.params.syncType,
      userId: req.userId,
    })
    next(error)
  }
}

/**
 * PUT /amazon/sync-schedule/:amazonAccountId
 * Update multiple sync schedules at once
 */
export async function updateSyncSchedules(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const { amazonAccountId } = req.params
    const { schedules } = req.body

    if (!amazonAccountId) {
      res.status(400).json({ error: 'amazonAccountId is required' })
      return
    }

    if (!Array.isArray(schedules)) {
      res.status(400).json({ error: 'schedules must be an array' })
      return
    }

    // Validate each schedule
    const validIntervals = Object.values(syncScheduleService.SYNC_INTERVALS)
    const validSyncTypes = ['orders', 'fees', 'ppc', 'inventory', 'listings', 'refunds']

    for (const schedule of schedules) {
      if (!schedule.syncType || !validSyncTypes.includes(schedule.syncType)) {
        res.status(400).json({
          error: `Invalid syncType in schedule. Must be one of: ${validSyncTypes.join(', ')}`,
        })
        return
      }

      if (
        schedule.intervalMinutes === undefined ||
        !validIntervals.includes(schedule.intervalMinutes)
      ) {
        res.status(400).json({
          error: `Invalid intervalMinutes in schedule. Must be one of: ${validIntervals.join(', ')}`,
        })
        return
      }

      if (schedule.enabled === undefined) {
        res.status(400).json({ error: 'enabled is required for each schedule' })
        return
      }
    }

    const updatedSchedules = await syncScheduleService.updateSyncSchedules(
      req.userId,
      amazonAccountId,
      schedules
    )

    res.status(200).json({
      success: true,
      message: 'Sync schedules updated',
      data: updatedSchedules,
    })
  } catch (error: any) {
    logger.error('Failed to update sync schedules', {
      error: error.message,
      amazonAccountId: req.params.amazonAccountId,
      userId: req.userId,
    })
    next(error)
  }
}
