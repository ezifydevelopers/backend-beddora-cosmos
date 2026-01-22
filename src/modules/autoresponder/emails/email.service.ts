import prisma from '../../../config/db'
import { Prisma } from '@prisma/client'
import { sendEmail } from '../../../config/mail'
import { logger } from '../../../config/logger'
import { AppError } from '../../../middlewares/error.middleware'
import { EmailSendInput, EmailStatsResponse, EmailTemplateInput, PurchaseEventInput } from './email.types'

const AMAZON_COMPLIANCE_RULES: Array<{ id: string; pattern: RegExp; message: string }> = [
  {
    id: 'no_incentives',
    pattern: /(free|gift\s*card|coupon|discount|rebate|refund|in\s+exchange|compensation)/i,
    message: 'Templates cannot include incentives or compensation language.',
  },
  {
    id: 'no_positive_review_prompt',
    pattern: /(positive\s+review|5\s*star|five\s*star|leave\s+us\s+a\s+review)/i,
    message: 'Templates cannot ask for positive or high-rating reviews.',
  },
  {
    id: 'no_marketing',
    pattern: /(newsletter|promotion|subscribe|follow\s+us|visit\s+our\s+website)/i,
    message: 'Templates cannot include marketing or promotional content.',
  },
]

function assertAmazonCompliance(subject: string, body: string) {
  const content = `${subject}\n${body}`
  for (const rule of AMAZON_COMPLIANCE_RULES) {
    if (rule.pattern.test(content)) {
      throw new AppError(`Amazon compliance: ${rule.message}`, 400)
    }
  }

  const links = content.match(/https?:\/\/\S+|www\.\S+/gi) || []
  const hasNonAmazonLink = links.some((link) => !/amazon\./i.test(link))
  if (hasNonAmazonLink) {
    throw new AppError('Amazon compliance: external links are not allowed.', 400)
  }
}

function renderTemplate(template: string, variables: Record<string, string | number | boolean | null>) {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key) => {
    const value = variables[key]
    return value === null || value === undefined ? `{{${key}}}` : String(value)
  })
}

function getTemplateDelayHours(variables: EmailTemplateInput['variables']) {
  const delayHours = Number((variables as any)?.automation?.delayHours ?? 0)
  const delayDays = Number((variables as any)?.automation?.delayDays ?? 0)
  if (Number.isFinite(delayHours) && delayHours > 0) {
    return delayHours
  }
  if (Number.isFinite(delayDays) && delayDays > 0) {
    return delayDays * 24
  }
  return 0
}

function ensureTemplateOwnership(template: { userId: string }, userId: string) {
  if (template.userId !== userId) {
    throw new AppError('Template not found or access denied', 403)
  }
}

export async function getTemplates(userId: string) {
  const templates = await prisma.emailTemplate.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
  })
  return { data: templates }
}

export async function createTemplate(userId: string, data: EmailTemplateInput) {
  assertAmazonCompliance(data.subject, data.body)
  const template = await prisma.emailTemplate.create({
    data: {
      userId,
      name: data.name,
      subject: data.subject,
      body: data.body,
      variables: data.variables !== undefined && data.variables !== null ? data.variables : Prisma.JsonNull,
      marketplaceId: data.marketplaceId || null,
      productId: data.productId || null,
      sku: data.sku || null,
      purchaseType: data.purchaseType || null,
    },
  })
  await createAuditLog(userId, 'EMAIL_TEMPLATE_CREATED', 'EmailTemplate', template.id, {
    name: template.name,
  })
  return { data: template }
}

export async function updateTemplate(userId: string, id: string, data: Partial<EmailTemplateInput>) {
  const existing = await prisma.emailTemplate.findUnique({ where: { id } })
  if (!existing) {
    throw new AppError('Template not found', 404)
  }
  ensureTemplateOwnership(existing, userId)

  const nextSubject = data.subject ?? existing.subject
  const nextBody = data.body ?? existing.body
  assertAmazonCompliance(nextSubject, nextBody)

  const template = await prisma.emailTemplate.update({
    where: { id },
    data: {
      name: data.name ?? existing.name,
      subject: data.subject ?? existing.subject,
      body: data.body ?? existing.body,
      variables: data.variables !== undefined 
        ? (data.variables !== null ? data.variables : Prisma.JsonNull)
        : (existing.variables !== null ? existing.variables : Prisma.JsonNull),
      marketplaceId: data.marketplaceId ?? existing.marketplaceId,
      productId: data.productId ?? existing.productId,
      sku: data.sku ?? existing.sku,
      purchaseType: data.purchaseType ?? existing.purchaseType,
    },
  })
  await createAuditLog(userId, 'EMAIL_TEMPLATE_UPDATED', 'EmailTemplate', template.id, {
    name: template.name,
  })
  return { data: template }
}

export async function deleteTemplate(userId: string, id: string) {
  const existing = await prisma.emailTemplate.findUnique({ where: { id } })
  if (!existing) {
    throw new AppError('Template not found', 404)
  }
  ensureTemplateOwnership(existing, userId)

  await prisma.emailTemplate.delete({ where: { id } })
  await createAuditLog(userId, 'EMAIL_TEMPLATE_DELETED', 'EmailTemplate', id, {
    name: existing.name,
  })
  return { success: true }
}

export async function sendEmailNow(userId: string, input: EmailSendInput) {
  const template = await prisma.emailTemplate.findUnique({
    where: { id: input.templateId },
  })
  if (!template) {
    throw new AppError('Template not found', 404)
  }
  ensureTemplateOwnership(template, userId)

  const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : new Date()
  const variables = input.variables || {}
  const payload = {
    templateSnapshot: { subject: template.subject, body: template.body },
    variables,
  }

  const queueItem = await prisma.emailQueue.create({
    data: {
      templateId: input.templateId,
      recipientEmail: input.recipientEmail,
      scheduledAt,
      status: 'pending',
      eventKey: input.eventKey || null,
      payload,
    },
  })

  if (scheduledAt <= new Date()) {
    try {
      const subject = renderTemplate(template.subject, variables)
      const body = renderTemplate(template.body, variables)
      await sendEmail(input.recipientEmail, subject, body)
      await prisma.emailQueue.update({
        where: { id: queueItem.id },
        data: { status: 'sent', sentAt: new Date() },
      })
      await createAuditLog(userId, 'EMAIL_SENT', 'EmailQueue', queueItem.id, {
        recipientEmail: input.recipientEmail,
        templateId: template.id,
      })
    } catch (error) {
      await prisma.emailQueue.update({
        where: { id: queueItem.id },
        data: { status: 'failed', errorMessage: (error as Error)?.message || 'Send failed' },
      })
      logger.error('Failed to send email', { error, queueId: queueItem.id })
    }
  }

  return { data: queueItem }
}

export async function getEmailQueue(userId: string) {
  const queue = await prisma.emailQueue.findMany({
    where: {
      template: { userId },
    },
    orderBy: { scheduledAt: 'desc' },
    include: { template: true },
  })

  return {
    data: queue.map((item) => ({
      id: item.id,
      templateId: item.templateId,
      templateName: item.template.name,
      recipientEmail: item.recipientEmail,
      scheduledAt: item.scheduledAt,
      sentAt: item.sentAt,
      status: item.status,
      openedCount: item.openedCount,
      clickedCount: item.clickedCount,
      responseCount: item.responseCount,
      errorMessage: item.errorMessage,
    })),
  }
}

export async function getEmailStats(userId: string): Promise<EmailStatsResponse> {
  const totalSent = await prisma.emailQueue.count({
    where: { status: 'sent', template: { userId } },
  })
  const totalPending = await prisma.emailQueue.count({
    where: { status: 'pending', template: { userId } },
  })
  const totalFailed = await prisma.emailQueue.count({
    where: { status: 'failed', template: { userId } },
  })

  const aggregate = await prisma.emailQueue.aggregate({
    where: { status: 'sent', template: { userId } },
    _sum: { openedCount: true, clickedCount: true, responseCount: true },
  })

  const opened = Number(aggregate._sum.openedCount || 0)
  const clicked = Number(aggregate._sum.clickedCount || 0)
  const responded = Number(aggregate._sum.responseCount || 0)

  const openRate = totalSent > 0 ? Number(((opened / totalSent) * 100).toFixed(2)) : 0
  const clickRate = totalSent > 0 ? Number(((clicked / totalSent) * 100).toFixed(2)) : 0
  const responseRate = totalSent > 0 ? Number(((responded / totalSent) * 100).toFixed(2)) : 0

  return {
    totalSent,
    totalPending,
    totalFailed,
    openRate,
    clickRate,
    responseRate,
  }
}

export async function queueRequestReviewEmails(purchaseEvents: PurchaseEventInput[]) {
  if (purchaseEvents.length === 0) {
    return { queued: 0 }
  }

  const userIds = Array.from(new Set(purchaseEvents.map((event) => event.userId)))
  const templates = await prisma.emailTemplate.findMany({
    where: { userId: { in: userIds } },
  })

  let queued = 0

  for (const event of purchaseEvents) {
    const matchingTemplates = templates.filter((template) => {
      if (template.userId !== event.userId) return false
      if (template.marketplaceId && template.marketplaceId !== event.marketplaceId) return false
      if (template.productId && template.productId !== event.productId) return false
      if (template.sku && template.sku !== event.sku) return false
      if (template.purchaseType && template.purchaseType !== event.purchaseType) return false
      return true
    })

    for (const template of matchingTemplates) {
      const delayHours = getTemplateDelayHours(template.variables as EmailTemplateInput['variables'])
      const scheduledAt = new Date(new Date(event.orderDate).getTime() + delayHours * 60 * 60 * 1000)
      const eventKey = event.orderId
      const existing = await prisma.emailQueue.findFirst({
        where: {
          templateId: template.id,
          recipientEmail: event.recipientEmail,
          eventKey,
        },
      })
      if (existing) {
        continue
      }

      const variables = {
        customerName: event.customerName || '',
        orderId: event.orderId,
        orderDate: event.orderDate,
        productTitle: event.productTitle || '',
        sku: event.sku || '',
        marketplaceId: event.marketplaceId || '',
        purchaseType: event.purchaseType || '',
      }

      await prisma.emailQueue.create({
        data: {
          templateId: template.id,
          recipientEmail: event.recipientEmail,
          scheduledAt,
          status: 'pending',
          eventKey,
          payload: {
            templateSnapshot: { subject: template.subject, body: template.body },
            variables,
          },
        },
      })
      queued += 1
    }
  }

  return { queued }
}

async function createAuditLog(
  userId: string,
  action: string,
  entity: string,
  entityId: string,
  changes?: Record<string, any>
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        entity,
        entityId,
        changes: changes ? JSON.parse(JSON.stringify(changes)) : null,
      },
    })
  } catch (error) {
    logger.error('Failed to create audit log', { error, userId, action, entity, entityId })
  }
}

