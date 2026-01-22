import prisma from '../../config/db'
import { logger } from '../../config/logger'
import { runScheduledReport } from './reports.service'

export async function processScheduledReports() {
  const now = new Date()
  const schedules = await prisma.reportSchedule.findMany({
    where: {
      nextRunAt: {
        lte: now,
      },
    },
  })

  for (const schedule of schedules) {
    try {
      await runScheduledReport(schedule.id)
    } catch (error) {
      logger.error('Failed to process scheduled report', { error, scheduleId: schedule.id })
    }
  }
}

