import crypto from 'crypto'

const VERIFICATION_TTL_HOURS = parseInt(process.env.EMAIL_VERIFY_TTL_HOURS || '24', 10)

/**
 * Generate an email verification token with expiry.
 */
export function generateEmailVerificationToken() {
  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date()
  expiresAt.setHours(expiresAt.getHours() + VERIFICATION_TTL_HOURS)
  return { token, expiresAt }
}
