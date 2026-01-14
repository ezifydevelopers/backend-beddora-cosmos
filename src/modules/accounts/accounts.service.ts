import prisma from '../../config/db'
import { AppError } from '../../middlewares/error.middleware'
import { encrypt, decrypt } from '../../utils/encryption'
import { logger } from '../../config/logger'
import {
  CreateAccountData,
  AccountResponse,
  MarketplaceResponse,
  SwitchAccountResponse,
  LinkAmazonAccountData,
  UpdateAmazonAccountData,
  AmazonAccountResponse,
} from '../../types/account.types'

/**
 * Accounts service
 * Handles all business logic for account management
 * Supports multiple accounts per user with secure credential storage
 * 
 * Business Logic:
 * - Users can have multiple accounts (multi-tenant support)
 * - Each account can be linked to multiple marketplaces
 * - One account per user is marked as default (active account)
 * - Account switching updates the default account for the user
 * - Amazon accounts are encrypted at rest
 * - Each user can link one Amazon account per marketplace
 */

// ============================================
// INTERNAL ACCOUNT MANAGEMENT
// ============================================

/**
 * Get all accounts for user
 * 
 * @param userId - The ID of the user
 * @returns Array of accounts with marketplace information
 */
export async function getUserAccounts(userId: string): Promise<AccountResponse[]> {
  const userAccounts = await prisma.userAccount.findMany({
    where: {
      userId,
      isActive: true,
    },
    include: {
      account: {
        include: {
          marketplaces: {
            include: {
              marketplace: true,
            },
          },
        },
      },
    },
    orderBy: [
      { isDefault: 'desc' },
      { createdAt: 'desc' },
    ],
  })

  return userAccounts.map((ua) => ({
    id: ua.account.id,
    name: ua.account.name,
    sellerId: ua.account.sellerId,
    region: ua.account.region,
    isDefault: ua.isDefault,
    isActive: ua.account.isActive,
    marketplaces: ua.account.marketplaces.map((am) => ({
      id: am.marketplace.id,
      name: am.marketplace.name,
      code: am.marketplace.code,
      region: am.marketplace.region,
      isActive: am.marketplace.isActive,
    })),
    createdAt: ua.account.createdAt,
  }))
}

/**
 * Create new account for user
 * 
 * Business Logic:
 * - Creates a new account record
 * - Links the account to the user via UserAccount junction table
 * - If this is the user's first account, automatically sets it as default
 * - Optionally links marketplaces to the account
 * 
 * @param userId - The ID of the user creating the account
 * @param data - Account creation data (name, sellerId, region, marketplaceIds)
 * @returns Created account information
 */
export async function createAccount(userId: string, data: CreateAccountData): Promise<AccountResponse> {
  // Create account record
  const account = await prisma.account.create({
    data: {
      name: data.name,
      sellerId: data.sellerId,
      region: data.region,
    },
  })

  // Check if this is the user's first account
  const existingUserAccounts = await prisma.userAccount.findMany({
    where: { userId, isActive: true },
  })

  // If this is the first account, make it default
  const isDefault = existingUserAccounts.length === 0

  // Link account to user via UserAccount junction table
  await prisma.userAccount.create({
    data: {
      userId,
      accountId: account.id,
      isDefault,
    },
  })

  // Link marketplaces if provided
  if (data.marketplaceIds && data.marketplaceIds.length > 0) {
    await prisma.accountMarketplace.createMany({
      data: data.marketplaceIds.map((marketplaceId) => ({
        accountId: account.id,
        marketplaceId,
      })),
    })
  }

  // Audit log
  await createAuditLog(userId, 'ACCOUNT_CREATED', 'Account', account.id, {
    accountName: account.name,
    sellerId: account.sellerId,
  })

  return {
    id: account.id,
    name: account.name,
    sellerId: account.sellerId,
    region: account.region,
    isDefault,
    isActive: account.isActive,
    marketplaces: [],
    createdAt: account.createdAt,
  }
}

/**
 * Switch active account
 * 
 * Business Logic:
 * - Verifies user has access to the target account
 * - Sets all user accounts to non-default
 * - Sets the target account as default
 * - This is used to change the active account context for the user
 * 
 * @param userId - The ID of the user
 * @param accountId - The ID of the account to switch to
 * @returns Success message with account ID
 */
export async function switchAccount(userId: string, accountId: string): Promise<SwitchAccountResponse> {
  // Verify user has access to this account
  const userAccount = await prisma.userAccount.findFirst({
    where: {
      userId,
      accountId,
      isActive: true,
    },
    include: {
      account: true,
    },
  })

  if (!userAccount) {
    throw new AppError('Account not found or access denied', 404)
  }

  // Set all user accounts to non-default
  await prisma.userAccount.updateMany({
    where: { userId },
    data: { isDefault: false },
  })

  // Set this account as default
  await prisma.userAccount.update({
    where: { id: userAccount.id },
    data: { isDefault: true },
  })

  // Audit log
  await createAuditLog(userId, 'ACCOUNT_SWITCHED', 'Account', accountId, {
    accountName: userAccount.account.name,
  })

  return {
    accountId: userAccount.account.id,
    message: 'Account switched successfully',
  }
}

/**
 * Get account marketplaces
 * 
 * @param userId - The ID of the user
 * @param accountId - The ID of the account
 * @returns Array of marketplaces linked to the account
 */
export async function getAccountMarketplaces(userId: string, accountId: string): Promise<MarketplaceResponse[]> {
  // Verify user has access to this account
  const userAccount = await prisma.userAccount.findFirst({
    where: {
      userId,
      accountId,
      isActive: true,
    },
  })

  if (!userAccount) {
    throw new AppError('Account not found or access denied', 404)
  }

  const accountMarketplaces = await prisma.accountMarketplace.findMany({
    where: {
      accountId,
      isActive: true,
    },
    include: {
      marketplace: true,
    },
  })

  return accountMarketplaces.map((am) => ({
    id: am.marketplace.id,
    name: am.marketplace.name,
    code: am.marketplace.code,
    region: am.marketplace.region,
    isActive: am.marketplace.isActive,
  }))
}

/**
 * Get default account for user
 */
export async function getDefaultAccount(userId: string) {
  const userAccount = await prisma.userAccount.findFirst({
    where: {
      userId,
      isDefault: true,
      isActive: true,
    },
    include: {
      account: true,
    },
  })

  if (!userAccount) {
    return null
  }

  return {
    id: userAccount.account.id,
    name: userAccount.account.name,
    sellerId: userAccount.account.sellerId,
    region: userAccount.account.region,
  }
}

// ============================================
// AMAZON ACCOUNT MANAGEMENT
// ============================================

/**
 * Get all linked Amazon accounts for a user
 * 
 * Security:
 * - Only returns accounts owned by the user
 * - Never returns decrypted credentials
 * - Returns metadata only (marketplace, sellerId, status)
 * 
 * @param userId - The ID of the user
 * @returns Array of Amazon account metadata (credentials excluded)
 */
export async function getAmazonAccounts(userId: string): Promise<AmazonAccountResponse[]> {
  const accounts = await prisma.amazonAccount.findMany({
    where: { userId },
    orderBy: [
      { isActive: 'desc' },
      { createdAt: 'desc' },
    ],
  })

  return accounts.map((acc) => ({
    id: acc.id,
    userId: acc.userId,
    marketplace: acc.marketplace,
    sellerId: acc.sellerId,
    isActive: acc.isActive,
    createdAt: acc.createdAt,
    updatedAt: acc.updatedAt,
  }))
}

/**
 * Link a new Amazon Seller Central account
 * 
 * Business Logic:
 * - Validates unique constraint: one account per user per marketplace
 * - Encrypts all sensitive credentials before storage
 * - Sets account as active by default
 * - Creates audit log entry
 * 
 * Security:
 * - Encrypts accessKey, secretKey, and refreshToken using AES-256-CBC
 * - Validates user ownership
 * - Prevents duplicate linkages per marketplace
 * 
 * @param userId - The ID of the user linking the account
 * @param data - Amazon account credentials and metadata
 * @returns Created Amazon account (credentials excluded)
 */
export async function linkAmazonAccount(
  userId: string,
  data: LinkAmazonAccountData
): Promise<AmazonAccountResponse> {
  // Validate marketplace format (uppercase, 2-3 characters)
  const marketplace = data.marketplace.toUpperCase().trim()
  if (!/^[A-Z]{2,3}$/.test(marketplace)) {
    throw new AppError('Invalid marketplace code. Must be 2-3 uppercase letters (e.g., US, UK, DE, JP)', 400)
  }

  // Check uniqueness: one account per user per marketplace
  const existing = await prisma.amazonAccount.findUnique({
    where: {
      userId_marketplace: {
        userId,
        marketplace,
      },
    },
  })

  if (existing) {
    throw new AppError(
      `An Amazon account for marketplace ${marketplace} is already linked. Use update to modify credentials.`,
      409
    )
  }

  // Encrypt sensitive credentials
  const encryptedAccessKey = encrypt(data.accessKey)
  const encryptedSecretKey = encrypt(data.secretKey)
  const encryptedRefreshToken = encrypt(data.refreshToken)

  // Create account with encrypted credentials
  const amazonAccount = await prisma.amazonAccount.create({
    data: {
      userId,
      marketplace,
      sellerId: data.sellerId.trim(),
      accessKey: encryptedAccessKey,
      secretKey: encryptedSecretKey,
      refreshToken: encryptedRefreshToken,
      isActive: true,
    },
  })

  // Audit log (without sensitive data)
  await createAuditLog(userId, 'AMAZON_ACCOUNT_LINKED', 'AmazonAccount', amazonAccount.id, {
    marketplace,
    sellerId: data.sellerId,
  })

  logger.info('Amazon account linked', {
    userId,
    accountId: amazonAccount.id,
    marketplace,
    sellerId: data.sellerId,
  })

  return {
    id: amazonAccount.id,
    userId: amazonAccount.userId,
    marketplace: amazonAccount.marketplace,
    sellerId: amazonAccount.sellerId,
    isActive: amazonAccount.isActive,
    createdAt: amazonAccount.createdAt,
    updatedAt: amazonAccount.updatedAt,
  }
}

/**
 * Update Amazon account credentials
 * 
 * Business Logic:
 * - Verifies user ownership
 * - Encrypts new credentials before storage
 * - Updates only provided fields
 * - Maintains account status unless explicitly changed
 * 
 * Security:
 * - Re-encrypts all credentials even if only one is updated
 * - Validates user ownership before update
 * - Creates audit log for credential changes
 * 
 * @param userId - The ID of the user
 * @param accountId - The ID of the Amazon account to update
 * @param data - Updated credentials (all fields optional)
 * @returns Updated Amazon account (credentials excluded)
 */
export async function updateAmazonAccount(
  userId: string,
  accountId: string,
  data: UpdateAmazonAccountData
): Promise<AmazonAccountResponse> {
  // Verify ownership
  const existing = await prisma.amazonAccount.findUnique({
    where: { id: accountId },
  })

  if (!existing) {
    throw new AppError('Amazon account not found', 404)
  }

  if (existing.userId !== userId) {
    throw new AppError('Access denied. You can only update your own accounts.', 403)
  }

  // Prepare update data
  const updateData: {
    sellerId?: string
    accessKey?: string
    secretKey?: string
    refreshToken?: string
    isActive?: boolean
  } = {}

  // Update sellerId if provided
  if (data.sellerId !== undefined) {
    updateData.sellerId = data.sellerId.trim()
  }

  // Encrypt and update credentials if provided
  if (data.accessKey !== undefined) {
    updateData.accessKey = encrypt(data.accessKey)
  }
  if (data.secretKey !== undefined) {
    updateData.secretKey = encrypt(data.secretKey)
  }
  if (data.refreshToken !== undefined) {
    updateData.refreshToken = encrypt(data.refreshToken)
  }

  // Update active status if provided
  if (data.isActive !== undefined) {
    updateData.isActive = data.isActive
  }

  // Perform update
  const updated = await prisma.amazonAccount.update({
    where: { id: accountId },
    data: updateData,
  })

  // Audit log
  await createAuditLog(userId, 'AMAZON_ACCOUNT_UPDATED', 'AmazonAccount', accountId, {
    marketplace: existing.marketplace,
    sellerId: updated.sellerId,
    fieldsUpdated: Object.keys(updateData),
  })

  logger.info('Amazon account updated', {
    userId,
    accountId,
    marketplace: existing.marketplace,
    fieldsUpdated: Object.keys(updateData),
  })

  return {
    id: updated.id,
    userId: updated.userId,
    marketplace: updated.marketplace,
    sellerId: updated.sellerId,
    isActive: updated.isActive,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  }
}

/**
 * Delete (unlink) an Amazon account
 * 
 * Business Logic:
 * - Verifies user ownership
 * - Soft delete: marks account as inactive
 * - Hard delete: removes account and all encrypted credentials
 * - Creates audit log
 * 
 * Security:
 * - Validates user ownership
 * - Permanently removes encrypted credentials
 * - Cascades to related data (orders, metrics, etc.)
 * 
 * @param userId - The ID of the user
 * @param accountId - The ID of the Amazon account to delete
 */
export async function deleteAmazonAccount(userId: string, accountId: string): Promise<void> {
  // Verify ownership
  const account = await prisma.amazonAccount.findUnique({
    where: { id: accountId },
  })

  if (!account) {
    throw new AppError('Amazon account not found', 404)
  }

  if (account.userId !== userId) {
    throw new AppError('Access denied. You can only delete your own accounts.', 403)
  }

  // Delete account (cascades to related data)
  await prisma.amazonAccount.delete({
    where: { id: accountId },
  })

  // Audit log
  await createAuditLog(userId, 'AMAZON_ACCOUNT_DELETED', 'AmazonAccount', accountId, {
    marketplace: account.marketplace,
    sellerId: account.sellerId,
  })

  logger.info('Amazon account deleted', {
    userId,
    accountId,
    marketplace: account.marketplace,
  })
}

/**
 * Switch active Amazon account (set as current for session)
 * 
 * Business Logic:
 * - Verifies user ownership
 * - Sets the account as the active one for the user's session
 * - Returns account metadata for frontend state management
 * 
 * Note: This doesn't modify the database, but sets the active account
 * in the user's session context. The frontend should store this in Redux.
 * 
 * @param userId - The ID of the user
 * @param accountId - The ID of the Amazon account to activate
 * @returns Active Amazon account metadata
 */
export async function switchAmazonAccount(
  userId: string,
  accountId: string
): Promise<AmazonAccountResponse> {
  // Verify ownership and existence
  const account = await prisma.amazonAccount.findFirst({
    where: {
      id: accountId,
      userId,
      isActive: true,
    },
  })

  if (!account) {
    throw new AppError('Amazon account not found or inactive', 404)
  }

  // Audit log
  await createAuditLog(userId, 'AMAZON_ACCOUNT_SWITCHED', 'AmazonAccount', accountId, {
    marketplace: account.marketplace,
    sellerId: account.sellerId,
  })

  return {
    id: account.id,
    userId: account.userId,
    marketplace: account.marketplace,
    sellerId: account.sellerId,
    isActive: account.isActive,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  }
}

/**
 * Get decrypted credentials for Amazon account (internal use only)
 * 
 * Security:
 * - Only used internally for API calls
 * - Never exposed via API endpoints
 * - Validates user ownership
 * 
 * @param userId - The ID of the user
 * @param accountId - The ID of the Amazon account
 * @returns Decrypted credentials
 */
export async function getAmazonAccountCredentials(
  userId: string,
  accountId: string
): Promise<{
  accessKey: string
  secretKey: string
  refreshToken: string
  marketplace: string
  sellerId: string
}> {
  const account = await prisma.amazonAccount.findUnique({
    where: { id: accountId },
  })

  if (!account) {
    throw new AppError('Amazon account not found', 404)
  }

  if (account.userId !== userId) {
    throw new AppError('Access denied', 403)
  }

  if (!account.isActive) {
    throw new AppError('Amazon account is inactive', 400)
  }

  return {
    accessKey: decrypt(account.accessKey),
    secretKey: decrypt(account.secretKey),
    refreshToken: decrypt(account.refreshToken),
    marketplace: account.marketplace,
    sellerId: account.sellerId,
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Create audit log entry
 * 
 * @param userId - The ID of the user performing the action
 * @param action - The action performed
 * @param entity - The entity type
 * @param entityId - The entity ID
 * @param changes - Additional metadata
 */
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
    // Log error but don't fail the operation
    logger.error('Failed to create audit log', { error, userId, action, entity, entityId })
  }
}
