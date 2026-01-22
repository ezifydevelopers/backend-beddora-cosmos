/**
 * Account Status Monitoring Service
 * 
 * Monitors Amazon account status and detects:
 * - Token revocation
 * - Account disconnection
 * - API access issues
 * - Token expiration
 * 
 * Architecture:
 * - Runs as background job
 * - Checks account health periodically
 * - Updates account status in database
 * - Can trigger alerts/notifications
 * - Can be extracted to separate microservice
 */

import prisma from '../../config/db'
import { logger } from '../../config/logger'
import { SPAPIClient } from './sp-api-wrapper.service'
import { AppError } from '../../middlewares/error.middleware'

/**
 * Account Status
 */
export enum AccountStatus {
  CONNECTED = 'CONNECTED',
  ERROR = 'ERROR',
  REVOKED = 'REVOKED',
  EXPIRED = 'EXPIRED',
  DISCONNECTED = 'DISCONNECTED',
}

/**
 * Check account status
 * 
 * Verifies that the account can still make SP-API calls.
 * 
 * @param amazonAccountId - Amazon account ID
 * @returns Account status and last check time
 */
export async function checkAccountStatus(amazonAccountId: string): Promise<{
  status: AccountStatus
  lastChecked: Date
  error?: string
}> {
  try {
    const account = await prisma.amazonAccount.findUnique({
      where: { id: amazonAccountId },
    })

    if (!account) {
      throw new AppError('Amazon account not found', 404)
    }

    if (!account.isActive) {
      return {
        status: AccountStatus.DISCONNECTED,
        lastChecked: new Date(),
        error: 'Account is inactive',
      }
    }

    // Try to make a simple API call to verify token validity
    try {
      const client = new SPAPIClient(amazonAccountId)
      
      // Use a lightweight endpoint to test connectivity
      // Get orders with minimal data (1 result, recent date)
      const testDate = new Date()
      testDate.setDate(testDate.getDate() - 1) // Yesterday
      
      await client.get('/orders/v0/orders', {
        MarketplaceIds: account.marketplaceIds.length > 0 
          ? account.marketplaceIds 
          : ['ATVPDKIKX0DER'], // Default to US
        CreatedAfter: testDate.toISOString(),
        MaxResultsPerPage: 1,
      })

      // Update last check time
      await prisma.amazonAccount.update({
        where: { id: amazonAccountId },
        data: {
          // Add lastStatusCheck field if it exists in schema
          // For now, we'll just log
        } as any,
      })

      logger.debug('Account status check passed', {
        amazonAccountId,
        status: AccountStatus.CONNECTED,
      })

      return {
        status: AccountStatus.CONNECTED,
        lastChecked: new Date(),
      }
    } catch (error: any) {
      const errorMessage = (error as Error).message
      let status = AccountStatus.ERROR

      // Detect specific error types
      if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
        status = AccountStatus.REVOKED
      } else if (errorMessage.includes('expired') || errorMessage.includes('Expired')) {
        status = AccountStatus.EXPIRED
      }

      logger.warn('Account status check failed', {
        amazonAccountId,
        status,
        error: errorMessage,
      })

      // Update account status in database
      await prisma.amazonAccount.update({
        where: { id: amazonAccountId },
        data: {
          isActive: status === AccountStatus.REVOKED ? false : account.isActive,
          // Add status field if it exists in schema
        } as any,
      })

      return {
        status,
        lastChecked: new Date(),
        error: errorMessage,
      }
    }
  } catch (error) {
    logger.error('Failed to check account status', {
      amazonAccountId,
      error: (error as Error).message,
    })

    return {
      status: AccountStatus.ERROR,
      lastChecked: new Date(),
      error: (error as Error).message,
    }
  }
}

/**
 * Monitor all active accounts
 * 
 * Checks status of all active Amazon accounts.
 * Should be run as a background job.
 * 
 * @param userId - Optional: check only accounts for specific user
 * @returns Monitoring results
 */
export async function monitorAllAccounts(userId?: string): Promise<{
  total: number
  connected: number
  errors: number
  revoked: number
  results: Array<{
    amazonAccountId: string
    status: AccountStatus
    error?: string
  }>
}> {
  const where: any = {
    isActive: true,
  }

  if (userId) {
    where.userId = userId
  }

  const accounts = await prisma.amazonAccount.findMany({
    where,
    select: {
      id: true,
      userId: true,
      amazonSellerId: true,
    },
  })

  const results: Array<{
    amazonAccountId: string
    status: AccountStatus
    error?: string
  }> = []

  let connected = 0
  let errors = 0
  let revoked = 0

  for (const account of accounts) {
    const status = await checkAccountStatus(account.id)

    results.push({
      amazonAccountId: account.id,
      status: status.status,
      error: status.error,
    })

    if (status.status === AccountStatus.CONNECTED) {
      connected++
    } else if (status.status === AccountStatus.REVOKED) {
      revoked++
    } else {
      errors++
    }
  }

  logger.info('Account monitoring completed', {
    total: accounts.length,
    connected,
    errors,
    revoked,
  })

  return {
    total: accounts.length,
    connected,
    errors,
    revoked,
    results,
  }
}

/**
 * Detect revoked tokens
 * 
 * Specifically checks for revoked tokens and marks accounts as inactive.
 * 
 * @returns List of revoked accounts
 */
export async function detectRevokedTokens(): Promise<Array<{
  amazonAccountId: string
  userId: string
  amazonSellerId: string
}>> {
  const revokedAccounts: Array<{
    amazonAccountId: string
    userId: string
    amazonSellerId: string
  }> = []

  const accounts = await prisma.amazonAccount.findMany({
    where: { isActive: true },
    select: {
      id: true,
      userId: true,
      amazonSellerId: true,
    },
  })

  for (const account of accounts) {
    const status = await checkAccountStatus(account.id)

    if (status.status === AccountStatus.REVOKED) {
      revokedAccounts.push({
        amazonAccountId: account.id,
        userId: account.userId,
        amazonSellerId: account.amazonSellerId,
      })

      // Mark account as inactive
      await prisma.amazonAccount.update({
        where: { id: account.id },
        data: { isActive: false } as any,
      })

      logger.warn('Detected revoked token', {
        amazonAccountId: account.id,
        userId: account.userId,
      })
    }
  }

  if (revokedAccounts.length > 0) {
    logger.warn('Revoked tokens detected', {
      count: revokedAccounts.length,
      accounts: revokedAccounts.map((a) => a.amazonAccountId),
    })
  }

  return revokedAccounts
}
