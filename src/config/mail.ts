import nodemailer from 'nodemailer'
import { env } from './env'
import { logger } from './logger'

/**
 * Email configuration
 * Nodemailer transporter setup
 */

const transporter = nodemailer.createTransport({
  host: env.smtpHost,
  port: env.smtpPort,
  secure: env.smtpPort === 465,
  auth: {
    user: env.smtpUser,
    pass: env.smtpPass,
  },
})

/**
 * Verify email configuration
 */
export async function verifyEmailConfig(): Promise<boolean> {
  try {
    await transporter.verify()
    logger.info('✅ Email configuration verified')
    return true
  } catch (error) {
    logger.warn('⚠️ Email configuration failed - emails will not be sent', error)
    return false
  }
}

/**
 * Send email
 */
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  text?: string,
  attachments?: Array<{ filename: string; content: Buffer; contentType: string }>
): Promise<void> {
  try {
    await transporter.sendMail({
      from: env.emailFrom,
      to,
      subject,
      text: text || html.replace(/<[^>]*>/g, ''),
      html,
      attachments,
    })
    logger.info(`Email sent to ${to}`)
  } catch (error) {
    logger.error('Failed to send email', error)
    throw error
  }
}

export default transporter

