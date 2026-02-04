import prisma from '../../config/db'
import { AppError } from '../../middlewares/error.middleware'
import bcrypt from 'bcryptjs'
import { UserProfileResponse, UpdateUserProfileData } from '../../types/user.types'

/**
 * Users service
 * Handles all business logic for user management
 * 
 * Business Logic:
 * - User profile management (read, update)
 * - Password change with security validation
 * - Email change requires re-verification
 */

/**
 * Get current user profile
 * 
 * @param userId - The ID of the user
 * @returns User profile with roles
 */
export async function getCurrentUser(userId: string): Promise<UserProfileResponse> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      isActive: true,
      isVerified: true,
      verifiedAt: true,
      twoFactorEnabled: true,
      createdAt: true,
      updatedAt: true,
      roles: {
        select: {
          role: {
            select: {
              name: true,
              description: true,
            },
          },
        },
      },
    },
  })

  if (!user) {
    throw new AppError('User not found', 404)
  }

  return {
    ...user,
    roles: user.roles.map((ur) => ur.role.name),
  }
}

/**
 * Update current user profile
 * 
 * Business Logic:
 * - Email changes require re-verification for security
 * - Prevents email conflicts with other users
 * - Name updates are immediate
 * 
 * @param userId - The ID of the user
 * @param data - Update data (name, email)
 * @returns Updated user profile
 */
export async function updateCurrentUser(userId: string, data: UpdateUserProfileData) {
  // If email is being updated, require re-verification
  if (data.email) {
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email },
    })

    if (existingUser && existingUser.id !== userId) {
      throw new AppError('Email already in use', 409)
    }
  }

  // Build update data object with proper typing
  const updateData: {
    name?: string
    email?: string
    isVerified?: boolean
    emailToken?: null
    emailTokenExpires?: null
  } = {}
  
  if (data.name !== undefined) updateData.name = data.name
  if (data.email !== undefined) {
    updateData.email = data.email
    updateData.isVerified = false // Require re-verification
    updateData.emailToken = null
    updateData.emailTokenExpires = null
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: updateData,
    select: {
      id: true,
      email: true,
      name: true,
      isActive: true,
      isVerified: true,
      updatedAt: true,
    },
  })

  return user
}

/**
 * Change password
 * 
 * Business Logic:
 * - Validates current password before allowing change
 * - Hashes new password with bcrypt (12 rounds)
 * - Revokes all refresh tokens for security (forces re-login on other devices)
 * 
 * @param userId - The ID of the user
 * @param currentPassword - Current password for verification
 * @param newPassword - New password to set
 * @returns Success message
 */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<{ message: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  })

  if (!user) {
    throw new AppError('User not found', 404)
  }

  // Verify current password
  const isPasswordValid = await bcrypt.compare(currentPassword, user.password)
  if (!isPasswordValid) {
    throw new AppError('Current password is incorrect', 400)
  }

  // Hash new password
  const hashedPassword = await bcrypt.hash(newPassword, 12)

  // Update password
  await prisma.user.update({
    where: { id: userId },
    data: { password: hashedPassword },
  })

  // Revoke all refresh tokens for security
  // This forces re-authentication on all devices after password change
  await prisma.refreshToken.deleteMany({
    where: { userId },
  })

  return { message: 'Password changed successfully' }
}

/**
 * List all users (admin only)
 * 
 * Business Logic:
 * - Returns all users with their roles
 * - Used for admin user management
 * - Includes user status (active, verified)
 * 
 * @returns Array of users with roles
 */
export async function listUsers() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      isActive: true,
      isVerified: true,
      verifiedAt: true,
      createdAt: true,
      roles: {
        select: {
          role: {
            select: {
              id: true,
              name: true,
              description: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return users.map((user) => ({
    ...user,
    roles: user.roles.map((ur) => ur.role),
  }))
}