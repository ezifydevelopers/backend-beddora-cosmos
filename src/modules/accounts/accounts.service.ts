import prisma from '../../config/db'
import { AppError } from '../../middlewares/error.middleware'
import { CreateAccountData, AccountResponse, MarketplaceResponse, SwitchAccountResponse } from '../../types/account.types'

/**
 * Accounts service
 * Handles all business logic for account management
 * Supports multiple accounts per user
 * 
 * Business Logic:
 * - Users can have multiple accounts (multi-tenant support)
 * - Each account can be linked to multiple marketplaces
 * - One account per user is marked as default (active account)
 * - Account switching updates the default account for the user
 */

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
      accountId: account.id, // Fixed: use account.id instead of userAccount.account.id
      isDefault,
    },
  })

  // Link marketplaces if provided
  if (data.marketplaceIds && data.marketplaceIds.length > 0) {
    await prisma.accountMarketplace.createMany({
      data: data.marketplaceIds.map((marketplaceId) => ({
        accountId: account.id, // Fixed: use account.id instead of userAccount.account.id
        marketplaceId,
      })),
    })
  }

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
