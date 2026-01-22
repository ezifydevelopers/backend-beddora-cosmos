import prisma from '../../config/db'
import PDFDocument from 'pdfkit'
import { AppError } from '../../middlewares/error.middleware'
import { ReportFilters, ReportFormat, ReportType, ScheduleReportRequest, UpdateScheduleRequest } from '../../types/reports.types'
import { logger } from '../../config/logger'
import { sendEmail } from '../../config/mail'
import * as xlsx from 'xlsx'

/**
 * Reports service
 * Handles report generation and scheduling
 */

async function verifyAccountAccess(userId: string, accountId: string): Promise<void> {
  const userAccount = await prisma.userAccount.findFirst({
    where: {
      userId,
      accountId,
      isActive: true,
    },
  })

  if (!userAccount) {
    throw new AppError('Account not found or access denied', 403)
  }
}

function buildDateFilter(startDate?: string, endDate?: string) {
  const filter: { gte?: Date; lte?: Date } = {}
  if (startDate) filter.gte = new Date(startDate)
  if (endDate) {
    const end = new Date(endDate)
    end.setHours(23, 59, 59, 999)
    filter.lte = end
  }
  return Object.keys(filter).length > 0 ? filter : undefined
}

async function buildReportData(reportType: ReportType, filters: ReportFilters) {
  const dateFilter = buildDateFilter(filters.startDate, filters.endDate)

  switch (reportType) {
    case 'profit': {
      const orders = await prisma.order.findMany({
        where: {
          accountId: filters.accountId,
          ...(filters.marketplaceId ? { marketplaceId: filters.marketplaceId } : {}),
          ...(dateFilter ? { orderDate: dateFilter } : {}),
        },
        select: {
          orderDate: true,
          totalAmount: true,
          fees: true,
          refunds: true,
        },
      })

      return orders.map((order) => ({
        date: order.orderDate.toISOString().split('T')[0],
        revenue: Number(order.totalAmount),
        fees: order.fees.reduce((sum, fee) => sum + Number(fee.amount), 0),
        refunds: order.refunds.reduce((sum, refund) => sum + Number(refund.amount), 0),
      }))
    }
    case 'inventory': {
      const inventory = await prisma.amazonInventory.findMany({
        where: {
          ...(filters.marketplaceId ? { marketplaceId: filters.marketplaceId } : {}),
          ...(filters.amazonAccountId ? { amazonAccountId: filters.amazonAccountId } : {}),
        },
        select: {
          sku: true,
          stockLevel: true,
          inboundQty: true,
          updatedAt: true,
        },
      })

      return inventory.map((item) => ({
        sku: item.sku,
        stockLevel: item.stockLevel,
        inboundQty: item.inboundQty,
        updatedAt: item.updatedAt.toISOString(),
      }))
    }
    case 'ppc': {
      const metrics = await prisma.pPCMetric.findMany({
        where: {
          ...(filters.amazonAccountId ? { amazonAccountId: filters.amazonAccountId } : {}),
          ...(filters.marketplaceId ? { marketplaceId: filters.marketplaceId } : {}),
          ...(filters.campaignId ? { campaignId: filters.campaignId } : {}),
          ...(dateFilter ? { date: dateFilter } : {}),
        },
        select: {
          date: true,
          campaignId: true,
          adGroupId: true,
          keywordId: true,
          spend: true,
          sales: true,
          acos: true,
        },
      })

      return metrics.map((metric) => ({
        date: metric.date.toISOString().split('T')[0],
        campaignId: metric.campaignId,
        adGroupId: metric.adGroupId,
        keywordId: metric.keywordId,
        spend: Number(metric.spend),
        sales: Number(metric.sales),
        acos: metric.acos ? Number(metric.acos) : null,
      }))
    }
    case 'returns': {
      const returns = await prisma.return.findMany({
        where: {
          accountId: filters.accountId,
          ...(filters.marketplaceId ? { marketplaceId: filters.marketplaceId } : {}),
          ...(filters.sku ? { sku: filters.sku } : {}),
          ...(dateFilter ? { createdAt: dateFilter } : {}),
        },
        select: {
          createdAt: true,
          sku: true,
          reasonCode: true,
          quantityReturned: true,
          refundAmount: true,
          feeAmount: true,
          isSellable: true,
        },
      })

      return returns.map((entry) => ({
        date: entry.createdAt.toISOString().split('T')[0],
        sku: entry.sku,
        reasonCode: entry.reasonCode,
        quantityReturned: entry.quantityReturned,
        refundAmount: Number(entry.refundAmount),
        feeAmount: Number(entry.feeAmount),
        isSellable: entry.isSellable ? 'Yes' : 'No',
      }))
    }
    default:
      return []
  }
}

function generateCsv(rows: Array<Record<string, any>>): Buffer {
  if (!rows.length) return Buffer.from('')
  const headers = Object.keys(rows[0])
  const lines = rows.map((row) => headers.map((key) => String(row[key] ?? '')).join(','))
  const csv = [headers.join(','), ...lines].join('\n')
  return Buffer.from(csv, 'utf-8')
}

function generateExcel(rows: Array<Record<string, any>>): Buffer {
  const worksheet = xlsx.utils.json_to_sheet(rows)
  const workbook = xlsx.utils.book_new()
  xlsx.utils.book_append_sheet(workbook, worksheet, 'Report')
  const excelBuffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' })
  return Buffer.from(excelBuffer)
}

function generatePdf(title: string, rows: Array<Record<string, any>>): Buffer {
  const doc = new PDFDocument({ margin: 36 })
  const chunks: Buffer[] = []

  doc.on('data', (chunk) => chunks.push(chunk))

  doc.fontSize(16).text(title)
  doc.moveDown()

  if (!rows.length) {
    doc.fontSize(12).text('No data available')
  } else {
    const headers = Object.keys(rows[0])
    doc.fontSize(10).text(headers.join(' | '))
    doc.moveDown(0.5)
    rows.forEach((row) => {
      doc.text(headers.map((key) => String(row[key] ?? '')).join(' | '))
    })
  }

  doc.end()

  return Buffer.concat(chunks)
}

export async function exportReport(userId: string, reportType: ReportType, format: ReportFormat, filters: ReportFilters) {
  await verifyAccountAccess(userId, filters.accountId)

  const rows = await buildReportData(reportType, filters)
  const title = `${reportType.toUpperCase()} Report`

  let buffer: Buffer
  let mimeType: string
  let extension: string

  switch (format) {
    case 'excel':
      buffer = generateExcel(rows)
      mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      extension = 'xlsx'
      break
    case 'pdf':
      buffer = generatePdf(title, rows)
      mimeType = 'application/pdf'
      extension = 'pdf'
      break
    case 'csv':
    default:
      buffer = generateCsv(rows)
      mimeType = 'text/csv'
      extension = 'csv'
  }

  const filename = `${reportType}-report-${Date.now()}.${extension}`
  return { buffer, mimeType, filename }
}

export async function listSchedules(userId: string, accountId: string) {
  await verifyAccountAccess(userId, accountId)

  const schedules = await prisma.reportSchedule.findMany({
    where: { accountId, userId },
    orderBy: { createdAt: 'desc' },
  })

  return { success: true, data: schedules }
}

function getNextRunAt(schedule: string) {
  const nextRunAt = new Date()
  if (schedule === 'weekly') {
    nextRunAt.setDate(nextRunAt.getDate() + 7)
  } else if (schedule === 'monthly') {
    nextRunAt.setMonth(nextRunAt.getMonth() + 1)
  } else {
    nextRunAt.setDate(nextRunAt.getDate() + 1)
  }
  return nextRunAt
}

export async function createSchedule(userId: string, payload: ScheduleReportRequest) {
  await verifyAccountAccess(userId, payload.accountId)

  const nextRunAt = getNextRunAt(payload.schedule)

  const schedule = await prisma.reportSchedule.create({
    data: {
      accountId: payload.accountId,
      userId,
      reportType: payload.reportType,
      filters: payload.filters,
      schedule: payload.schedule,
      emailRecipients: payload.emailRecipients,
      nextRunAt,
    },
  })

  return { success: true, data: schedule }
}

export async function updateSchedule(userId: string, id: string, payload: UpdateScheduleRequest) {
  const schedule = await prisma.reportSchedule.findUnique({ where: { id } })
  if (!schedule) {
    throw new AppError('Schedule not found', 404)
  }

  await verifyAccountAccess(userId, schedule.accountId)

  const updated = await prisma.reportSchedule.update({
    where: { id },
    data: {
      reportType: payload.reportType,
      filters: payload.filters,
      schedule: payload.schedule,
      emailRecipients: payload.emailRecipients,
      nextRunAt: payload.schedule ? getNextRunAt(payload.schedule) : undefined,
    },
  })

  return { success: true, data: updated }
}

export async function deleteSchedule(userId: string, id: string) {
  const schedule = await prisma.reportSchedule.findUnique({ where: { id } })
  if (!schedule) {
    throw new AppError('Schedule not found', 404)
  }

  await verifyAccountAccess(userId, schedule.accountId)
  await prisma.reportSchedule.delete({ where: { id } })
  return { success: true }
}

export async function runScheduledReport(scheduleId: string) {
  const schedule = await prisma.reportSchedule.findUnique({
    where: { id: scheduleId },
  })

  if (!schedule) return

  try {
    const filters = schedule.filters as ReportFilters
    const result = await exportReport(schedule.userId, schedule.reportType as ReportType, 'pdf', filters)

    await Promise.all(
      schedule.emailRecipients.map((recipient) =>
        sendEmail(
          recipient,
          `${schedule.reportType.toUpperCase()} Report`,
          `<p>Your scheduled report is ready. Please find the report attached.</p>`,
          undefined,
          [
            {
              filename: result.filename,
              content: result.buffer,
              contentType: result.mimeType,
            },
          ]
        )
      )
    )

    await prisma.reportSchedule.update({
      where: { id: scheduleId },
      data: {
        lastRunAt: new Date(),
        nextRunAt: getNextRunAt(schedule.schedule),
      },
    })
  } catch (error) {
    logger.error('Failed to run scheduled report', { error, scheduleId })
  }
}

