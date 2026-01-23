import prisma from '../../config/db'
import { logger } from '../../config/logger'
import { AppError } from '../../middlewares/error.middleware'
import { encrypt, decrypt } from '../../utils/encryption'
import { auditCredentialChange } from '../../utils/audit.service'

/**
 * Amazon Account Service
 * 
 * Production-ready service for managing Amazon seller account credentials.
 * 
 * Responsibilities:
 * - Store seller SP-API credentials securely
 * - Retrieve and decrypt credentials
 * - Update credentials (e.g., on token rotation)
 * - Delete credentials when seller disconnects
 * 
 * Architecture:
 * - This service handles database operations for AmazonAccount
 * - Can be extracted to a separate microservice in the future
 * - No route handling, no business logic
 * 
 * Security:
 * - All sensitive data is encrypted before storage
 * - Never exposes credentials to frontend
 * - Never logs sensitive data
 */

export interface CreateAmazonAccountInput {
  userId: string
  amazonSellerId: string
  marketplace: string
  lwaClientId: string
  lwaClientSecret?: string // Optional - Application IDs may not require it
  refreshToken: string
  iamRoleArn?: string
  marketplaceIds?: string[]
  region?: string
}

export interface UpdateAmazonAccountInput {
  lwaClientId?: string
  lwaClientSecret?: string
  refreshToken?: string
  iamRoleArn?: string
  marketplaceIds?: string[]
  region?: string
  isActive?: boolean
}

/**
 * Create or update Amazon account credentials
 * 
 * If an account already exists for this user/marketplace combination,
 * it will be updated. Otherwise, a new account will be created.
 * 
 * @param input - Account credentials and configuration
 * @returns Created or updated AmazonAccount
 */
export async function upsertAmazonAccount(input: CreateAmazonAccountInput) {
  const {
    userId,
    amazonSellerId,
    marketplace,
    lwaClientId,
    lwaClientSecret,
    refreshToken,
    iamRoleArn,
    marketplaceIds = [],
    region = 'us-east-1',
  } = input

  // Validate inputs
  // Note: lwaClientSecret is optional for Application IDs (amzn1.application-oa2-client.xxx)
  // Solution IDs (amzn1.sp.solution.xxx) typically require it
  if (!userId || !amazonSellerId || !marketplace || !lwaClientId || !refreshToken) {
    throw new AppError('Missing required account credentials: userId, amazonSellerId, marketplace, lwaClientId, and refreshToken are required', 400)
  }

  // Encrypt sensitive data
  const encryptedClientId = encrypt(lwaClientId)
  // Client secret is optional - encrypt empty string if not provided
  const encryptedClientSecret = lwaClientSecret ? encrypt(lwaClientSecret) : encrypt('')
  const encryptedRefreshToken = encrypt(refreshToken)

  try {
    // Check if account already exists
    const existing = await prisma.amazonAccount.findFirst({
      where: {
        userId,
        marketplace,
      },
    })

    if (existing) {
      // Update existing account
      logger.info('Updating existing Amazon account', {
        userId,
        amazonSellerId,
        marketplace,
      })

      const updated = await prisma.amazonAccount.update({
        where: { id: existing.id },
        data: {
          amazonSellerId,
          sellerId: amazonSellerId, // Keep legacy field in sync
          lwaClientId: encryptedClientId,
          lwaClientSecret: encryptedClientSecret,
          refreshToken: encryptedRefreshToken,
          iamRoleArn: iamRoleArn || existing.iamRoleArn,
          marketplaceIds: marketplaceIds.length > 0 ? marketplaceIds : existing.marketplaceIds,
          region: region || existing.region,
          isActive: true,
        },
      })

      return updated
    } else {
      // Create new account
      logger.info('Creating new Amazon account', {
        userId,
        amazonSellerId,
        marketplace,
      })

      const created = await prisma.amazonAccount.create({
        data: {
          userId,
          amazonSellerId,
          sellerId: amazonSellerId, // Legacy field
          marketplace,
          lwaClientId: encryptedClientId,
          lwaClientSecret: encryptedClientSecret,
          refreshToken: encryptedRefreshToken,
          iamRoleArn,
          marketplaceIds,
          region,
          isActive: true,
        },
      })

      return created
    }
  } catch (error: any) {
    logger.error('Failed to upsert Amazon account', {
      userId,
      amazonSellerId,
      marketplace,
      error: error.message,
    })
    throw new AppError('Failed to save Amazon account credentials', 500)
  }
}

/**
 * Get Amazon account by ID
 * 
 * SECURITY: Verifies userId ownership to prevent data leakage between sellers.
 * 
 * @param accountId - AmazonAccount ID
 * @param userId - User ID (required for security - verifies ownership)
 * @param includeDecrypted - If true, returns decrypted credentials (use with caution)
 * @returns AmazonAccount (credentials encrypted unless includeDecrypted is true)
 */
export async function getAmazonAccount(
  accountId: string,
  userId: string,
  includeDecrypted: boolean = false
) {
  const account = await prisma.amazonAccount.findUnique({
    where: { id: accountId },
  })

  if (!account) {
    throw new AppError('Amazon account not found', 404)
  }

  // CRITICAL: Verify ownership to prevent data leakage
  if (account.userId !== userId) {
    throw new AppError('Unauthorized to access this account', 403)
  }

  if (includeDecrypted) {
    // Decrypt credentials (only for internal use, never expose to frontend)
    // Client secret is optional - only decrypt if present and not empty
    const encryptedClientSecret = account.lwaClientSecret
    const lwaClientSecret = encryptedClientSecret && encryptedClientSecret.trim() !== ''
      ? decrypt(encryptedClientSecret)
      : undefined

    return {
      ...account,
      lwaClientId: decrypt(account.lwaClientId),
      lwaClientSecret,
      refreshToken: decrypt(account.refreshToken),
    }
  }

  return account
}

/**
 * Get all Amazon accounts for a user
 * 
 * @param userId - User ID
 * @returns Array of AmazonAccount (credentials remain encrypted)
 */
export async function getUserAmazonAccounts(userId: string) {
  return prisma.amazonAccount.findMany({
    where: { userId, isActive: true },
    select: {
      id: true,
      userId: true,
      amazonSellerId: true,
      marketplace: true,
      marketplaceIds: true,
      region: true,
      iamRoleArn: true,
      isActive: true,
      lastTokenRefreshAt: true,
      createdAt: true,
      updatedAt: true,
      // Never return encrypted fields
    },
  })
}

/**
 * Update Amazon account
 * 
 * SECURITY: Verifies userId ownership to prevent unauthorized updates.
 * 
 * @param accountId - AmazonAccount ID
 * @param userId - User ID (required for security - verifies ownership)
 * @param input - Fields to update
 * @returns Updated AmazonAccount
 */
export async function updateAmazonAccount(
  accountId: string,
  userId: string,
  input: UpdateAmazonAccountInput
) {
  const account = await prisma.amazonAccount.findUnique({
    where: { id: accountId },
  })

  if (!account) {
    throw new AppError('Amazon account not found', 404)
  }

  // CRITICAL: Verify ownership to prevent unauthorized updates
  if (account.userId !== userId) {
    throw new AppError('Unauthorized to update this account', 403)
  }

  const updateData: any = {}

  // Encrypt sensitive fields if provided
  if (input.lwaClientId) {
    updateData.lwaClientId = encrypt(input.lwaClientId)
  }
  if (input.lwaClientSecret) {
    updateData.lwaClientSecret = encrypt(input.lwaClientSecret)
  }
  if (input.refreshToken) {
    updateData.refreshToken = encrypt(input.refreshToken)
  }
  if (input.iamRoleArn !== undefined) {
    updateData.iamRoleArn = input.iamRoleArn
  }
  if (input.marketplaceIds !== undefined) {
    updateData.marketplaceIds = input.marketplaceIds
  }
  if (input.region !== undefined) {
    updateData.region = input.region
  }
  if (input.isActive !== undefined) {
    updateData.isActive = input.isActive
  }

  return prisma.amazonAccount.update({
    where: { id: accountId },
    data: updateData,
  })
}

/**
 * Delete Amazon account (soft delete by setting isActive to false)
 * 
 * @param accountId - AmazonAccount ID
 * @param userId - User ID (for authorization check)
 */
export async function deleteAmazonAccount(
  accountId: string,
  userId: string,
  ipAddress?: string,
  userAgent?: string
) {
  const account = await prisma.amazonAccount.findUnique({
    where: { id: accountId },
  })

  if (!account) {
    throw new AppError('Amazon account not found', 404)
  }

  if (account.userId !== userId) {
    throw new AppError('Unauthorized to delete this account', 403)
  }

  // Soft delete by setting isActive to false
  // This preserves data for audit purposes
  await prisma.amazonAccount.update({
    where: { id: accountId },
    data: { isActive: false },
  })

  // Audit credential deletion
  await auditCredentialChange(
    userId,
    'deleted',
    accountId,
    {
      marketplace: account.marketplace,
      amazonSellerId: account.amazonSellerId,
      deletionType: 'soft',
    },
    ipAddress,
    userAgent
  )

  logger.info('Amazon account deactivated', {
    accountId,
    userId,
  })
}

/**
 * Hard delete Amazon account (permanently removes from database)
 * 
 * WARNING: This permanently deletes all associated data.
 * Use with extreme caution.
 * 
 * @param accountId - AmazonAccount ID
 * @param userId - User ID (for authorization check)
 */
export async function hardDeleteAmazonAccount(accountId: string, userId: string) {
  const account = await prisma.amazonAccount.findUnique({
    where: { id: accountId },
  })

  if (!account) {
    throw new AppError('Amazon account not found', 404)
  }

  if (account.userId !== userId) {
    throw new AppError('Unauthorized to delete this account', 403)
  }

  // Audit credential deletion before hard delete
  await auditCredentialChange(
    userId,
    'deleted',
    accountId,
    {
      marketplace: account.marketplace,
      amazonSellerId: account.amazonSellerId,
      deletionType: 'hard',
    }
  )

  // Hard delete (cascade will handle related records)
  await prisma.amazonAccount.delete({
    where: { id: accountId },
  })

  // Clear token cache before deletion
  try {
    const { clearTokenCache } = await import('./token.service')
    const { decrypt } = await import('../../utils/encryption')
    const clientId = decrypt(account.lwaClientId)
    const refreshToken = decrypt(account.refreshToken)
    await clearTokenCache(clientId, refreshToken)
  } catch (error) {
    logger.debug('Could not clear token cache before deletion', {
      accountId,
      error: (error as Error).message,
    })
  }

  // Clear IAM credentials cache
  try {
    const { clearCredentialsCache } = await import('./iam.service')
    if (account.iamRoleArn) {
      await clearCredentialsCache(account.iamRoleArn)
    }
  } catch (error) {
    logger.debug('Could not clear IAM credentials cache before deletion', {
      accountId,
      error: (error as Error).message,
    })
  }

  logger.info('Amazon account permanently deleted', {
    accountId,
    userId,
  })
}

/**
 * Delete token and cleanup all related data
 * 
 * This function:
 * - Soft deletes the account (sets isActive to false)
 * - Clears token cache
 * - Clears IAM credentials cache
 * - Creates audit log
 * 
 * Use this when seller disconnects their account.
 * 
 * @param accountId - AmazonAccount ID
 * @param userId - User ID (for authorization check)
 * @param ipAddress - IP address of the request
 * @param userAgent - User agent string
 */
export async function deleteTokenAndCleanup(
  accountId: string,
  userId: string,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  const account = await prisma.amazonAccount.findUnique({
    where: { id: accountId },
  })

  if (!account) {
    throw new AppError('Amazon account not found', 404)
  }

  if (account.userId !== userId) {
    throw new AppError('Unauthorized to delete this account', 403)
  }

  // Soft delete
  await deleteAmazonAccount(accountId, userId, ipAddress, userAgent)

  // Clear token cache
  try {
    const { clearTokenCache } = await import('./token.service')
    const { decrypt } = await import('../../utils/encryption')
    const clientId = decrypt(account.lwaClientId)
    const refreshToken = decrypt(account.refreshToken)
    await clearTokenCache(clientId, refreshToken)
    logger.debug('Cleared token cache after account deletion', { accountId })
  } catch (error) {
    logger.debug('Could not clear token cache', {
      accountId,
      error: (error as Error).message,
    })
  }

  // Clear IAM credentials cache
  try {
    const { clearCredentialsCache } = await import('./iam.service')
    if (account.iamRoleArn) {
      await clearCredentialsCache(account.iamRoleArn)
      logger.debug('Cleared IAM credentials cache after account deletion', { accountId })
    }
  } catch (error) {
    logger.debug('Could not clear IAM credentials cache', {
      accountId,
      error: (error as Error).message,
    })
  }

  logger.info('Token deleted and cleanup completed', {
    accountId,
    userId,
  })
}
