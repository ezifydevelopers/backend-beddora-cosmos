import prisma from '../../../config/db'
import { sendEmail } from '../../../config/mail'
import { logger } from '../../../config/logger'

function renderTemplate(template: string, variables: Record<string, string | number | boolean | null>) {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key) => {
    const value = variables[key]
    return value === null || value === undefined ? `{{${key}}}` : String(value)
  })
}

/**
 * Email scheduler
 * Wire this to a cron/queue worker for production delivery.
 */
export async function processPendingEmails() {
  const now = new Date()
  const pending = await prisma.emailQueue.findMany({
    where: { status: 'pending', scheduledAt: { lte: now } },
    take: 100,
    include: { template: true },
  })

  if (pending.length === 0) {
    return { processed: 0 }
  }

  let processed = 0

  for (const item of pending) {
    const payload = (item.payload || {}) as {
      templateSnapshot?: { subject?: string; body?: string }
      variables?: Record<string, string | number | boolean | null>
    }
    const variables = payload.variables || {}
    const subjectSource = payload.templateSnapshot?.subject || item.template.subject
    const bodySource = payload.templateSnapshot?.body || item.template.body

    try {
      const subject = renderTemplate(subjectSource, variables)
      const body = renderTemplate(bodySource, variables)
      await sendEmail(item.recipientEmail, subject, body)
      await prisma.emailQueue.update({
        where: { id: item.id },
        data: { status: 'sent', sentAt: new Date(), errorMessage: null },
      })
      processed += 1
    } catch (error) {
      await prisma.emailQueue.update({
        where: { id: item.id },
        data: { status: 'failed', errorMessage: (error as Error)?.message || 'Send failed' },
      })
      logger.error('Failed to process queued email', { error, queueId: item.id })
    }
  }

  return { processed }
}

