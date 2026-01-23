/**
 * Sync Schedule Service
 * 
 * Manages per-account sync scheduling configuration
 * Allows users to configure different sync intervals for each account and sync type
 */

import prisma from '../../config/db'
import { logger } from '../../config/logger'
import { getQueue, QueueName } from '../../config/queue'
import { DataSyncJobData } from '../../config/queue'
import { isRedisConnected } from '../../config/redis'

/**
 * Sync interval options (in minutes)
 */
export const SYNC_INTERVALS = {
  DISABLED: 0,
  EVERY_15_MIN: 15,
  EVERY_30_MIN: 30,
  EVERY_HOUR: 60,
  EVERY_2_HOURS: 120,
  EVERY_4_HOURS: 240,
  EVERY_6_HOURS: 360,
  EVERY_12_HOURS: 720,
  DAILY: 1440,
  WEEKLY: 10080,
} as const

export type SyncInterval = typeof SYNC_INTERVALS[keyof typeof SYNC_INTERVALS]

/**
 * Sync type
 */
export type SyncType = 'orders' | 'fees' | 'ppc' | 'inventory' | 'listings' | 'refunds' | 'all'

/**
 * Sync schedule configuration
 */
export interface SyncScheduleConfig {
  amazonAccountId: string
  userId: string
  syncType: SyncType
  intervalMinutes: SyncInterval
  enabled: boolean
  lastRunAt?: Date | null
  nextRunAt?: Date | null
}

/**
 * Get sync schedule for an account
 */
export async function getSyncSchedule(
  userId: string,
  amazonAccountId: string
): Promise<SyncScheduleConfig[]> {
  const account = await prisma.amazonAccount.findUnique({
    where: { id: amazonAccountId },
    select: { userId: true },
  })

  if (!account) {
    throw new Error('Amazon account not found')
  }

  if (account.userId !== userId) {
    throw new Error('Access denied')
  }

  const schedules = await prisma.syncSchedule.findMany({
    where: {
      amazonAccountId,
      userId,
    },
    orderBy: {
      syncType: 'asc',
    },
  })

  // If no schedules exist, return default configuration
  if (schedules.length === 0) {
    return getDefaultSyncSchedules(amazonAccountId, userId)
  }

  return schedules.map((schedule) => ({
    amazonAccountId: schedule.amazonAccountId,
    userId: schedule.userId,
    syncType: schedule.syncType as SyncType,
    intervalMinutes: schedule.intervalMinutes as SyncInterval,
    enabled: schedule.enabled,
    lastRunAt: schedule.lastRunAt,
    nextRunAt: schedule.nextRunAt,
  }))
}

/**
 * Get default sync schedules
 */
function getDefaultSyncSchedules(
  amazonAccountId: string,
  userId: string
): SyncScheduleConfig[] {
  return [
    {
      amazonAccountId,
      userId,
      syncType: 'orders',
      intervalMinutes: SYNC_INTERVALS.EVERY_HOUR,
      enabled: true,
    },
    {
      amazonAccountId,
      userId,
      syncType: 'fees',
      intervalMinutes: SYNC_INTERVALS.EVERY_2_HOURS,
      enabled: true,
    },
    {
      amazonAccountId,
      userId,
      syncType: 'ppc',
      intervalMinutes: SYNC_INTERVALS.EVERY_HOUR,
      enabled: true,
    },
    {
      amazonAccountId,
      userId,
      syncType: 'inventory',
      intervalMinutes: SYNC_INTERVALS.EVERY_2_HOURS,
      enabled: true,
    },
    {
      amazonAccountId,
      userId,
      syncType: 'listings',
      intervalMinutes: SYNC_INTERVALS.EVERY_4_HOURS,
      enabled: true,
    },
    {
      amazonAccountId,
      userId,
      syncType: 'refunds',
      intervalMinutes: SYNC_INTERVALS.EVERY_2_HOURS,
      enabled: true,
    },
  ]
}

/**
 * Update sync schedule for an account
 */
export async function updateSyncSchedule(
  userId: string,
  amazonAccountId: string,
  syncType: SyncType,
  config: {
    intervalMinutes: SyncInterval
    enabled: boolean
  }
): Promise<SyncScheduleConfig> {
  const account = await prisma.amazonAccount.findUnique({
    where: { id: amazonAccountId },
    select: { userId: true },
  })

  if (!account) {
    throw new Error('Amazon account not found')
  }

  if (account.userId !== userId) {
    throw new Error('Access denied')
  }

  // Calculate next run time
  const nextRunAt =
    config.enabled && config.intervalMinutes > 0
      ? new Date(Date.now() + config.intervalMinutes * 60 * 1000)
      : null

  const schedule = await prisma.syncSchedule.upsert({
    where: {
      amazonAccountId_syncType: {
        amazonAccountId,
        syncType,
      },
    },
    create: {
      amazonAccountId,
      userId,
      syncType,
      intervalMinutes: config.intervalMinutes,
      enabled: config.enabled,
      nextRunAt,
    },
    update: {
      intervalMinutes: config.intervalMinutes,
      enabled: config.enabled,
      nextRunAt,
    },
  })

  // If schedule was updated and enabled, schedule the next job
  if (config.enabled && config.intervalMinutes > 0 && isRedisConnected()) {
    await scheduleNextSync(amazonAccountId, userId, syncType, config.intervalMinutes)
  }

  logger.info('Sync schedule updated', {
    amazonAccountId,
    userId,
    syncType,
    intervalMinutes: config.intervalMinutes,
    enabled: config.enabled,
  })

  return {
    amazonAccountId: schedule.amazonAccountId,
    userId: schedule.userId,
    syncType: schedule.syncType as SyncType,
    intervalMinutes: schedule.intervalMinutes as SyncInterval,
    enabled: schedule.enabled,
    lastRunAt: schedule.lastRunAt,
    nextRunAt: schedule.nextRunAt,
  }
}

/**
 * Update multiple sync schedules at once
 */
export async function updateSyncSchedules(
  userId: string,
  amazonAccountId: string,
  schedules: Array<{
    syncType: SyncType
    intervalMinutes: SyncInterval
    enabled: boolean
  }>
): Promise<SyncScheduleConfig[]> {
  const account = await prisma.amazonAccount.findUnique({
    where: { id: amazonAccountId },
    select: { userId: true },
  })

  if (!account) {
    throw new Error('Amazon account not found')
  }

  if (account.userId !== userId) {
    throw new Error('Access denied')
  }

  const results: SyncScheduleConfig[] = []

  for (const scheduleConfig of schedules) {
    const result = await updateSyncSchedule(userId, amazonAccountId, scheduleConfig.syncType, {
      intervalMinutes: scheduleConfig.intervalMinutes,
      enabled: scheduleConfig.enabled,
    })
    results.push(result)
  }

  return results
}

/**
 * Get all accounts that need syncing based on their schedules
 */
export async function getAccountsDueForSync(): Promise<
  Array<{
    amazonAccountId: string
    userId: string
    syncType: SyncType
    schedule: SyncScheduleConfig
  }>
> {
  const now = new Date()

  const schedules = await prisma.syncSchedule.findMany({
    where: {
      enabled: true,
      intervalMinutes: { gt: 0 },
      OR: [
        { nextRunAt: { lte: now } },
        { nextRunAt: null },
      ],
    },
    include: {
      amazonAccount: {
        select: {
          isActive: true,
        },
      },
    },
  })

  const dueForSync: Array<{
    amazonAccountId: string
    userId: string
    syncType: SyncType
    schedule: SyncScheduleConfig
  }> = []

  for (const schedule of schedules) {
    // Only sync if account is active
    if (!schedule.amazonAccount.isActive) {
      continue
    }

    // Check if it's time to sync
    if (schedule.nextRunAt && schedule.nextRunAt > now) {
      continue
    }

    dueForSync.push({
      amazonAccountId: schedule.amazonAccountId,
      userId: schedule.userId,
      syncType: schedule.syncType as SyncType,
      schedule: {
        amazonAccountId: schedule.amazonAccountId,
        userId: schedule.userId,
        syncType: schedule.syncType as SyncType,
        intervalMinutes: schedule.intervalMinutes as SyncInterval,
        enabled: schedule.enabled,
        lastRunAt: schedule.lastRunAt,
        nextRunAt: schedule.nextRunAt,
      },
    })
  }

  return dueForSync
}

/**
 * Mark sync as completed and schedule next run
 */
export async function markSyncCompleted(
  amazonAccountId: string,
  userId: string,
  syncType: SyncType
): Promise<void> {
  const schedule = await prisma.syncSchedule.findUnique({
    where: {
      amazonAccountId_syncType: {
        amazonAccountId,
        syncType,
      },
    },
  })

  if (!schedule || !schedule.enabled || schedule.intervalMinutes === 0) {
    return
  }

  const now = new Date()
  const nextRunAt = new Date(now.getTime() + schedule.intervalMinutes * 60 * 1000)

  await prisma.syncSchedule.update({
    where: {
      amazonAccountId_syncType: {
        amazonAccountId,
        syncType,
      },
    },
    data: {
      lastRunAt: now,
      nextRunAt,
    },
  })

  logger.debug('Sync marked as completed', {
    amazonAccountId,
    syncType,
    nextRunAt,
  })
}

/**
 * Schedule next sync job
 */
async function scheduleNextSync(
  amazonAccountId: string,
  userId: string,
  syncType: SyncType,
  intervalMinutes: number
): Promise<void> {
  if (!isRedisConnected()) {
    return
  }

  const queue = getQueue<DataSyncJobData>(QueueName.DATA_SYNC)
  const delay = intervalMinutes * 60 * 1000 // Convert to milliseconds

  await queue.add(
    `scheduled-sync-${amazonAccountId}-${syncType}`,
    {
      amazonAccountId,
      userId,
      syncType,
    },
    {
      jobId: `scheduled-sync-${amazonAccountId}-${syncType}-${Date.now()}`,
      delay,
      removeOnComplete: true,
    }
  )

  logger.debug('Scheduled next sync', {
    amazonAccountId,
    syncType,
    intervalMinutes,
    delay,
  })
}

/**
 * Initialize sync schedules for a new account
 */
export async function initializeSyncSchedulesForAccount(
  amazonAccountId: string,
  userId: string
): Promise<void> {
  const defaultSchedules = getDefaultSyncSchedules(amazonAccountId, userId)

  for (const schedule of defaultSchedules) {
    await prisma.syncSchedule.upsert({
      where: {
        amazonAccountId_syncType: {
          amazonAccountId,
          syncType: schedule.syncType,
        },
      },
      create: {
        amazonAccountId,
        userId,
        syncType: schedule.syncType,
        intervalMinutes: schedule.intervalMinutes,
        enabled: schedule.enabled,
        nextRunAt: schedule.enabled
          ? new Date(Date.now() + schedule.intervalMinutes * 60 * 1000)
          : null,
      },
      update: {}, // Don't update if exists
    })
  }

  logger.info('Initialized sync schedules for account', {
    amazonAccountId,
    userId,
  })
}

/**
 * Convert interval minutes to cron pattern
 */
export function intervalToCronPattern(intervalMinutes: number): string {
  if (intervalMinutes < 60) {
    // Less than an hour - use minutes
    return `*/${intervalMinutes} * * * *`
  } else if (intervalMinutes === 60) {
    // Every hour
    return '0 * * * *'
  } else if (intervalMinutes < 1440) {
    // Less than a day - use hours
    const hours = Math.floor(intervalMinutes / 60)
    return `0 */${hours} * * *`
  } else if (intervalMinutes === 1440) {
    // Daily
    return '0 0 * * *'
  } else {
    // Weekly or more
    return '0 0 * * 0' // Every Sunday
  }
}

/**
 * Get human-readable interval description
 */
export function getIntervalDescription(intervalMinutes: SyncInterval): string {
  switch (intervalMinutes) {
    case SYNC_INTERVALS.DISABLED:
      return 'Disabled'
    case SYNC_INTERVALS.EVERY_15_MIN:
      return 'Every 15 minutes'
    case SYNC_INTERVALS.EVERY_30_MIN:
      return 'Every 30 minutes'
    case SYNC_INTERVALS.EVERY_HOUR:
      return 'Every hour'
    case SYNC_INTERVALS.EVERY_2_HOURS:
      return 'Every 2 hours'
    case SYNC_INTERVALS.EVERY_4_HOURS:
      return 'Every 4 hours'
    case SYNC_INTERVALS.EVERY_6_HOURS:
      return 'Every 6 hours'
    case SYNC_INTERVALS.EVERY_12_HOURS:
      return 'Every 12 hours'
    case SYNC_INTERVALS.DAILY:
      return 'Daily'
    case SYNC_INTERVALS.WEEKLY:
      return 'Weekly'
    default:
      return `${intervalMinutes} minutes`
  }
}
