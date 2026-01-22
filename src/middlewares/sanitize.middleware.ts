/**
 * Request/Response Sanitization Middleware
 * 
 * Sanitizes sensitive data from:
 * - Request bodies before logging
 * - Response bodies before sending
 * - Error messages
 * 
 * Security:
 * - Prevents sensitive data exposure in logs
 * - Masks tokens, passwords, secrets
 * - Recursively sanitizes nested objects
 */

import { Request, Response, NextFunction } from 'express'
import { sanitizeSensitiveData, maskSensitiveStrings } from '../utils/security.utils'
import { logger } from '../config/logger'

/**
 * Sanitize request body before processing
 * 
 * Creates a sanitized copy of the request body for logging purposes.
 * Original body remains unchanged for processing.
 */
export function sanitizeRequest(req: Request, res: Response, next: NextFunction): void {
  // Store original body
  const originalBody = req.body

  // Create sanitized version for logging (if needed)
  if (originalBody && typeof originalBody === 'object') {
    req.sanitizedBody = sanitizeSensitiveData(originalBody)
  }

  next()
}

/**
 * Sanitize response before sending
 * 
 * Intercepts response and sanitizes sensitive data.
 * Use with caution - may affect response structure.
 */
export function sanitizeResponse(req: Request, res: Response, next: NextFunction): void {
  const originalJson = res.json.bind(res)

  res.json = function (body: any): Response {
    // Sanitize response body
    const sanitized = sanitizeSensitiveData(body)
    return originalJson(sanitized)
  }

  next()
}

/**
 * Sanitize error messages in logs
 * 
 * Ensures error logs don't contain sensitive data.
 */
export function sanitizeErrorLogs(error: any, req?: Request): any {
  const sanitized = {
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

  // Sanitize request info if provided
  if (req) {
    sanitized.path = req.path
    sanitized.method = req.method
    sanitized.query = sanitizeSensitiveData(req.query)
    sanitized.body = sanitizeSensitiveData(req.body)
  }

  return sanitized
}
