import crypto from 'crypto'
import { AppError } from '../middlewares/error.middleware'

/**
 * Encryption Key Validation
 * 
 * CRITICAL: Encryption key must be exactly 32 characters for AES-256-CBC
 * Never use default/fallback keys in production - fail fast if missing
 * 
 * Note: Validation is lazy (only when encrypt/decrypt is called)
 * to allow startup validation to run first and provide better error messages.
 */
function getEncryptionKey(): string {
  const key = process.env.ENCRYPTION_KEY
  
  if (!key) {
    throw new AppError(
      'CRITICAL: ENCRYPTION_KEY environment variable is required. ' +
      'Generate a secure 32-character key: openssl rand -hex 16',
      500
    )
  }
  
  if (key.length !== 32) {
    throw new AppError(
      `ENCRYPTION_KEY must be exactly 32 characters. Current length: ${key.length}. ` +
      'Generate a secure key: openssl rand -hex 16',
      500
    )
  }
  
  // Warn if using default/weak key (only in development)
  if (key === '12345678901234567890123456789012' && process.env.NODE_ENV === 'production') {
    throw new AppError(
      'CRITICAL: Cannot use default encryption key in production. ' +
      'Set ENCRYPTION_KEY to a secure 32-character value.',
      500
    )
  }
  
  return key
}

// Lazy initialization - only get key when needed
let ENCRYPTION_KEY: string | null = null
const IV_LENGTH = 16 // For AES, this is always 16

function getKey(): string {
  if (!ENCRYPTION_KEY) {
    ENCRYPTION_KEY = getEncryptionKey()
  }
  return ENCRYPTION_KEY
}

/**
 * Encrypt text
 * @param text - Text to encrypt
 */
export function encrypt(text: string): string {
  const key = getKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key), iv)
  let encrypted = cipher.update(text)

  encrypted = Buffer.concat([encrypted, cipher.final()])

  return iv.toString('hex') + ':' + encrypted.toString('hex')
}

/**
 * Decrypt text
 * @param text - Encrypted text (iv:content)
 */
export function decrypt(text: string): string {
  const key = getKey()
  const textParts = text.split(':')
  const iv = Buffer.from(textParts.shift() as string, 'hex')
  const encryptedText = Buffer.from(textParts.join(':'), 'hex')
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key), iv)
  let decrypted = decipher.update(encryptedText)

  decrypted = Buffer.concat([decrypted, decipher.final()])

  return decrypted.toString()
}
