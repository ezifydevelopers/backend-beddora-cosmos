/**
 * Audit Logging Service
 * 
 * Centralized audit logging for security events and credential changes.
 * 
 * Features:
 * - Logs credential changes (create, update, delete)
 * - Logs OAuth authorization events
 * - Logs token refresh events
 * - Includes IP address and user agent
 * - Sanitizes sensitive data before logging
 * 
 * Architecture:
 * - Reusable service for audit logging
 * - Can be extracted to separate audit microservice
 * - No business logic
 */

import prisma from '../config/db'
import { logger } from '../config/logger'
import { sanitizeSensitiveData } from './security.utils'

/**
 * Create audit log entry
 * 
 * @param userId - User ID performing the action
 * @param action - Action performed (e.g., 'amazon_account.created', 'oauth.authorized')
 * @param entity - Entity type (e.g., 'AmazonAccount', 'OAuthState')
 * @param entityId - Entity ID
 * @param changes - Changes made (will be sanitized)
 * @param ipAddress - IP address of the request
 * @param userAgent - User agent string
 */
export async function createAuditLog(
  userId: string,
  action: string,
  entity: string,
  entityId: string,
  changes?: Record<string, any>,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  try {
    // Sanitize changes to prevent logging sensitive data
    const sanitizedChanges = changes ? sanitizeSensitiveData(changes) : null

    await prisma.auditLog.create({
      data: {
        userId,
        action,
        entity,
        entityId,
        changes: sanitizedChanges ? JSON.parse(JSON.stringify(sanitizedChanges)) : null,
        ipAddress: ipAddress || null,
        userAgent: userAgent || null,
      },
    })

    logger.debug('Audit log created', {
      userId,
      action,
      entity,
      entityId,
    })
  } catch (error) {
    // Log error but don't fail the operation
    logger.error('Failed to create audit log', {
      error: (error as Error).message,
      userId,
      action,
      entity,
      entityId,
    })
  }
}

/**
 * Audit log for Amazon account credential changes
 */
export async function auditCredentialChange(
  userId: string,
  action: 'created' | 'updated' | 'deleted' | 'rotated',
  amazonAccountId: string,
  changes?: Record<string, any>,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  await createAuditLog(
    userId,
    `amazon_account.${action}`,
    'AmazonAccount',
    amazonAccountId,
    changes,
    ipAddress,
    userAgent
  )
}

/**
 * Audit log for OAuth events
 */
export async function auditOAuthEvent(
  userId: string,
  action: 'authorization_started' | 'authorization_completed' | 'authorization_failed',
  state?: string,
  changes?: Record<string, any>,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  await createAuditLog(
    userId,
    `oauth.${action}`,
    'OAuthState',
    state || 'unknown',
    changes,
    ipAddress,
    userAgent
  )
}

/**
 * Audit log for token refresh events
 */
export async function auditTokenRefresh(
  userId: string,
  amazonAccountId: string,
  tokenRotated: boolean,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  await createAuditLog(
    userId,
    'token.refreshed',
    'AmazonAccount',
    amazonAccountId,
    {
      tokenRotated,
      timestamp: new Date().toISOString(),
    },
    ipAddress,
    userAgent
  )
}
