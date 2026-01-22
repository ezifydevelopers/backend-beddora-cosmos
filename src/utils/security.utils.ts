/**
 * Security Utilities
 * 
 * Provides security-related helper functions:
 * - Webhook signature verification
 * - Data sanitization
 * - Sensitive data masking
 * - CSRF token generation/verification
 * 
 * Architecture:
 * - Reusable utilities for security operations
 * - No business logic
 * - Can be extracted to security microservice
 */

import crypto from 'crypto'

/**
 * Verify Amazon SP-API webhook signature
 * 
 * Amazon signs webhooks using HMAC-SHA256 with a shared secret.
 * This function verifies the signature to ensure the webhook is from Amazon.
 * 
 * @param payload - Raw request body (string)
 * @param signature - Signature from X-Amzn-Signature header
 * @param secret - Shared secret (from webhook configuration)
 * @returns true if signature is valid
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  if (!payload || !signature || !secret) {
    return false
  }

  try {
    // Amazon uses HMAC-SHA256 for webhook signatures
    const hmac = crypto.createHmac('sha256', secret)
    hmac.update(payload)
    const expectedSignature = hmac.digest('hex')

    // Use constant-time comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    )
  } catch (error) {
    return false
  }
}

/**
 * Sanitize sensitive data from objects
 * 
 * Removes or masks sensitive fields before logging or returning to client.
 * 
 * @param data - Object to sanitize
 * @param sensitiveFields - Array of field names to mask/remove
 * @returns Sanitized object
 */
export function sanitizeSensitiveData(
  data: any,
  sensitiveFields: string[] = [
    'password',
    'refreshToken',
    'accessToken',
    'clientSecret',
    'secretKey',
    'accessKey',
    'lwaClientSecret',
    'lwaClientId',
    'refresh_token',
    'access_token',
    'client_secret',
    'authorization',
    'cookie',
  ]
): any {
  if (!data || typeof data !== 'object') {
    return data
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeSensitiveData(item, sensitiveFields))
  }

  const sanitized: any = {}

  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase()

    // Check if this field should be sanitized
    const shouldSanitize = sensitiveFields.some(
      (field) => lowerKey.includes(field.toLowerCase())
    )

    if (shouldSanitize) {
      // Mask sensitive data (show first 4 chars and last 4 chars if long enough)
      if (typeof value === 'string' && value.length > 8) {
        sanitized[key] = `${value.substring(0, 4)}...${value.substring(value.length - 4)}`
      } else if (typeof value === 'string') {
        sanitized[key] = '***'
      } else {
        sanitized[key] = '[REDACTED]'
      }
    } else if (typeof value === 'object' && value !== null) {
      // Recursively sanitize nested objects
      sanitized[key] = sanitizeSensitiveData(value, sensitiveFields)
    } else {
      sanitized[key] = value
    }
  }

  return sanitized
}

/**
 * Mask sensitive values in strings
 * 
 * Replaces sensitive patterns (like tokens, keys) with [REDACTED]
 * 
 * @param text - Text to mask
 * @returns Masked text
 */
export function maskSensitiveStrings(text: string): string {
  if (!text || typeof text !== 'string') {
    return text
  }

  // Patterns to mask:
  // - JWT tokens (Bearer tokens)
  // - Amazon refresh tokens (Atzr|...)
  // - API keys (long alphanumeric strings)
  // - Client secrets

  let masked = text

  // Mask JWT tokens
  masked = masked.replace(/Bearer\s+[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+/g, 'Bearer [REDACTED]')

  // Mask Amazon refresh tokens (Atzr|...)
  masked = masked.replace(/Atzr\|[A-Za-z0-9\-_]+/g, 'Atzr|[REDACTED]')

  // Mask long alphanumeric strings (likely API keys)
  masked = masked.replace(/\b[A-Za-z0-9]{32,}\b/g, (match) => {
    // Don't mask if it's a UUID (has dashes) or already masked
    if (match.includes('-') || match === '[REDACTED]') {
      return match
    }
    return match.substring(0, 8) + '...' + match.substring(match.length - 4)
  })

  return masked
}

/**
 * Generate CSRF token
 * 
 * @param length - Token length in bytes (default: 32)
 * @returns Hex-encoded CSRF token
 */
export function generateCSRFToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex')
}

/**
 * Verify CSRF token (constant-time comparison)
 * 
 * @param token - Token to verify
 * @param expected - Expected token
 * @returns true if tokens match
 */
export function verifyCSRFToken(token: string, expected: string): boolean {
  if (!token || !expected || token.length !== expected.length) {
    return false
  }

  try {
    return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))
  } catch (error) {
    return false
  }
}

/**
 * Sanitize error messages for logging
 * 
 * Removes sensitive data from error messages before logging.
 * 
 * @param error - Error object or message
 * @returns Sanitized error information
 */
export function sanitizeErrorForLogging(error: any): {
  message: string
  stack?: string
  code?: string
  name?: string
} {
  const sanitized: any = {
    message: maskSensitiveStrings(String(error?.message || error || 'Unknown error')),
  }

  if (error?.stack) {
    sanitized.stack = maskSensitiveStrings(error.stack)
  }

  if (error?.code) {
    sanitized.code = error.code
  }

  if (error?.name) {
    sanitized.name = error.name
  }

  return sanitized
}

/**
 * Extract IP address from request
 * 
 * Handles proxies and load balancers (X-Forwarded-For header)
 * 
 * @param req - Express request object
 * @returns IP address
 */
export function getClientIP(req: any): string {
  const forwarded = req.headers['x-forwarded-for']
  if (forwarded) {
    // X-Forwarded-For can contain multiple IPs, take the first one
    const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded
    return ips.split(',')[0].trim()
  }

  return req.ip || req.connection?.remoteAddress || 'unknown'
}

/**
 * Validate redirect URI for OAuth
 * 
 * Prevents open redirect vulnerabilities by validating redirect URIs.
 * 
 * @param redirectUri - Redirect URI to validate
 * @param allowedDomains - Array of allowed domain patterns
 * @returns true if redirect URI is safe
 */
export function validateRedirectUri(
  redirectUri: string,
  allowedDomains: string[] = []
): boolean {
  if (!redirectUri || typeof redirectUri !== 'string') {
    return false
  }

  try {
    const url = new URL(redirectUri)

    // Only allow http/https
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return false
    }

    // If allowed domains are specified, check against them
    if (allowedDomains.length > 0) {
      return allowedDomains.some((domain) => {
        // Support exact match or subdomain match
        return url.hostname === domain || url.hostname.endsWith('.' + domain)
      })
    }

    // Default: allow localhost and same-origin redirects
    // In production, you should specify allowed domains
    if (process.env.NODE_ENV === 'production') {
      // In production, require explicit allowed domains
      return allowedDomains.length > 0
    }

    // Development: allow localhost
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  } catch (error) {
    // Invalid URL
    return false
  }
}
