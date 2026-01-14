import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import prisma from '../../config/db'
import { env } from '../../config/env'
import { logger } from '../../config/logger'
import { sendEmail } from '../../config/mail'
import { AppError } from '../../middlewares/error.middleware'
import {
  RegisterData,
  LoginData,
  TokenPayload,
  AuthResponse,
  RefreshTokenResponse,
} from '../../types/auth.types'
import { hashPassword } from './password.service'
import { generateEmailVerificationToken } from './token.service'

/**
 * Authentication service
 * Handles all business logic for authentication
 * 
 * Business Logic:
 * - User registration with email verification
 * - JWT-based authentication with refresh tokens
 * - Password reset flow with secure token generation
 * - Email verification with expiration
 * - Multi-account support (active account in token)
 * 
 * Security:
 * - Passwords hashed with bcrypt (12 rounds)
 * - JWT tokens with expiration
 * - Refresh tokens stored in database
 * - Email verification tokens expire after 7 days
 * - Password reset tokens expire after 1 hour
 */

/**
 * Generate JWT access token
 * 
 * @param payload - Token payload containing user info and roles
 * @returns Signed JWT access token
 */
function generateAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  })
}

/**
 * Generate refresh token and store in database
 * 
 * Business Logic:
 * - Creates a long-lived refresh token (30 days)
 * - Stores token in database for revocation capability
 * - Used to obtain new access tokens without re-authentication
 * 
 * @param userId - The ID of the user
 * @param payload - Token payload to embed in refresh token
 * @returns Generated refresh token string
 */
async function generateAndStoreRefreshToken(userId: string, payload: TokenPayload): Promise<string> {
  const refreshToken = jwt.sign(payload, env.jwtRefreshSecret, {
    expiresIn: env.jwtRefreshExpiresIn,
  })

  // Calculate expiration date (30 days from now)
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 30)

  // Store refresh token in database for revocation capability
  await prisma.refreshToken.create({
    data: {
      userId,
      token: refreshToken,
      expiresAt,
    },
  })

  return refreshToken
}

/**
 * Generate email verification token
 * 
 * Security: Uses cryptographically secure random bytes
 * 
 * @returns Random hex string token (64 characters)
 */
function generateEmailToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

/**
 * Register a new user
 * 
 * Business Logic:
 * - Validates terms acceptance
 * - Checks for duplicate email
 * - Hashes password with bcrypt (12 rounds)
 * - Creates user with email verification token
 * - Assigns default VIEWER role
 * - Sends verification email (non-blocking)
 * 
 * @param data - Registration data
 * @returns User object and success message
 */
export async function register(data: RegisterData): Promise<{ user: { id: string; email: string; name: string | null; isActive: boolean; isVerified: boolean; createdAt: Date }; message: string }> {
  // Validate terms acceptance
  if (!data.acceptTerms || !data.acceptPrivacy) {
    throw new AppError('You must accept Terms & Conditions and Privacy Policy', 400)
  }

  // Check if user already exists
  const existingUser = await prisma.user.findUnique({
    where: { email: data.email },
  })

  if (existingUser) {
    throw new AppError('User with this email already exists', 409)
  }

  // Hash password
  const hashedPassword = await hashPassword(data.password)

  // Generate email verification token
  const { token: emailToken, expiresAt } = generateEmailVerificationToken()

  // Create user
  const user = await prisma.user.create({
    data: {
      email: data.email,
      password: hashedPassword,
      name: data.name,
      isVerified: false,
      termsAccepted: true,
    },
    select: {
      id: true,
      email: true,
      name: true,
      isActive: true,
      isVerified: true,
      createdAt: true,
    },
  })

  // Create email verification record
  await prisma.emailVerification.create({
    data: {
      userId: user.id,
      token: emailToken,
      expiresAt,
      used: false,
    },
  })

  // Assign default 'VIEWER' role
  const viewerRole = await prisma.role.findUnique({ where: { name: 'viewer' } })
  if (viewerRole) {
    await prisma.userRole.create({
      data: {
        userId: user.id,
        roleId: viewerRole.id,
      },
    })
  }

  // Send verification email
  try {
    const verificationUrl = `${env.corsOrigin}/verify-email?token=${emailToken}`
    await sendEmail(
      user.email,
      'Verify your email address',
      `Please verify your email by clicking this link: ${verificationUrl}`
    )
  } catch (error) {
    logger.warn('Failed to send verification email', error)
    // Don't fail registration if email fails
  }

  return {
    user,
    message: 'Registration successful. Please check your email to verify your account.',
  }
}

/**
 * Login user
 * 
 * Business Logic:
 * - Validates user credentials
 * - Checks account status (active, email verified)
 * - Retrieves user roles and default account
 * - Generates JWT access token and refresh token
 * - Updates last login timestamp
 * 
 * Security:
 * - Password comparison uses bcrypt (constant-time)
 * - Blocks unverified accounts
 * - Blocks inactive accounts
 * 
 * @param data - Login credentials
 * @returns Authentication response with tokens
 */
export async function login(data: LoginData): Promise<AuthResponse> {
  // Find user with roles
  const user = await prisma.user.findUnique({
    where: { email: data.email },
    include: {
      roles: {
        include: {
          role: true,
        },
      },
    },
  })

  if (!user) {
    throw new AppError('Invalid email or password', 401)
  }

  // Check if user is active
  if (!user.isActive) {
    throw new AppError('Account is deactivated', 403)
  }

  // Block login if email not verified
  if (!user.isVerified) {
    throw new AppError('Please verify your email before logging in', 403)
  }

  // Verify password
  const isPasswordValid = await bcrypt.compare(data.password, user.password)

  if (!isPasswordValid) {
    throw new AppError('Invalid email or password', 401)
  }

  // Get user roles
  const roleNames = user.roles.map((ur) => ur.role.name)

  // Get default account if exists
  const defaultAccount = await prisma.userAccount.findFirst({
    where: {
      userId: user.id,
      isDefault: true,
      isActive: true,
    },
    include: {
      account: true,
    },
  })

  // Generate tokens
  const tokenPayload: TokenPayload = {
    userId: user.id,
    email: user.email,
    roles: roleNames,
    activeAccountId: defaultAccount?.account.id || undefined,
  }

  const accessToken = generateAccessToken(tokenPayload)
  const refreshToken = await generateAndStoreRefreshToken(user.id, tokenPayload)

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      isVerified: user.isVerified,
      roles: roleNames,
    },
    accessToken,
    refreshToken,
    activeAccountId: defaultAccount?.account.id || null,
  }
}

/**
 * Refresh access token
 */
/**
 * Refresh access token using refresh token
 * 
 * Business Logic:
 * - Validates refresh token signature and expiration
 * - Checks token exists in database and is not revoked
 * - Verifies user is still active and email verified
 * - Generates new access token with updated roles/account
 * 
 * @param refreshTokenString - The refresh token string
 * @returns New access token and refresh token
 */
export async function refreshToken(refreshTokenString: string): Promise<RefreshTokenResponse> {
  // Verify refresh token signature and expiration
  try {
    jwt.verify(refreshTokenString, env.jwtRefreshSecret) as TokenPayload
  } catch {
    throw new AppError('Invalid refresh token', 401)
  }

  // Check if token exists in database and is not revoked
  const tokenRecord = await prisma.refreshToken.findUnique({
    where: { token: refreshTokenString },
    include: {
      user: {
        include: {
          roles: {
            include: {
              role: true,
            },
          },
        },
      },
    },
  })

  if (!tokenRecord || tokenRecord.isRevoked || tokenRecord.expiresAt < new Date()) {
    throw new AppError('Invalid or expired refresh token', 401)
  }

  // Check if user is still active
  if (!tokenRecord.user.isActive || !tokenRecord.user.isVerified) {
    throw new AppError('User account is inactive or unverified', 403)
  }

  // Get updated roles
  const roleNames = tokenRecord.user.roles.map((ur: { role: { name: string } }) => ur.role.name)

  // Get default account
  const defaultAccount = await prisma.userAccount.findFirst({
    where: {
      userId: tokenRecord.user.id,
      isDefault: true,
      isActive: true,
    },
    include: {
      account: true,
    },
  })

  // Generate new access token
  const tokenPayload: TokenPayload = {
    userId: tokenRecord.user.id,
    email: tokenRecord.user.email,
    roles: roleNames,
    activeAccountId: defaultAccount?.account.id || undefined,
  }

  const newAccessToken = generateAccessToken(tokenPayload)

  // Optionally rotate refresh token (security best practice)
  // For now, we'll keep the same refresh token
  // Uncomment below to enable token rotation:
  /*
  await prisma.refreshToken.update({
    where: { id: tokenRecord.id },
    data: { isRevoked: true },
  })
  const newRefreshToken = await generateAndStoreRefreshToken(tokenRecord.user.id, tokenPayload)
  return { accessToken: newAccessToken, refreshToken: newRefreshToken }
  */

  return {
    accessToken: newAccessToken,
  }
}

/**
 * Logout - revoke refresh token
 */
export async function logout(refreshTokenString: string, userId: string) {
  // Revoke refresh token
  await prisma.refreshToken.updateMany({
    where: {
      token: refreshTokenString,
      userId,
    },
    data: {
      isRevoked: true,
    },
  })

  return { message: 'Logged out successfully' }
}

/**
 * Verify email
 */
/**
 * Verify user email address
 * 
 * Business Logic:
 * - Validates verification token
 * - Checks token expiration (7 days)
 * - Updates user isVerified status
 * - Marks verification record as used
 * 
 * @param token - Email verification token
 * @returns Success message
 */
export async function verifyEmail(token: string): Promise<{ message: string }> {
  const verification = await prisma.emailVerification.findUnique({
    where: { token },
    include: { user: true },
  })

  if (!verification) {
    throw new AppError('Invalid verification token', 400)
  }

  if (verification.used) {
    throw new AppError('Verification token already used', 400)
  }

  if (verification.expiresAt < new Date()) {
    throw new AppError('Verification token has expired', 400)
  }

  // Update user and verification record
  await prisma.$transaction([
    prisma.user.update({
      where: { id: verification.userId },
      data: {
        isVerified: true,
        verifiedAt: new Date(),
      },
    }),
    prisma.emailVerification.update({
      where: { id: verification.id },
      data: {
        used: true,
        usedAt: new Date(),
      },
    }),
  ])

  return { message: 'Email verified successfully' }
}

/**
 * Request password reset
 * 
 * Business Logic:
 * - Generates secure reset token (1 hour expiration)
 * - Creates password reset record
 * - Sends reset email (non-blocking)
 * - Does not reveal if email exists (security)
 * 
 * @param email - User email address
 * @returns Success message (always same for security)
 */
export async function requestPasswordReset(email: string): Promise<{ message: string }> {
  const user = await prisma.user.findUnique({
    where: { email },
  })

  if (!user) {
    // Don't reveal if user exists for security
    return { message: 'If the email exists, a reset link has been sent' }
  }

  // Generate reset token
  const resetToken = generateEmailToken()
  const expiresAt = new Date()
  expiresAt.setHours(expiresAt.getHours() + 1) // 1 hour

  // Create or update password reset record
  await prisma.passwordReset.create({
    data: {
      userId: user.id,
      token: resetToken,
      expiresAt,
    },
  })

  // Send reset email
  try {
    const resetUrl = `${env.corsOrigin}/reset-password?token=${resetToken}`
    await sendEmail(
      user.email,
      'Password Reset Request',
      `Click this link to reset your password: ${resetUrl}`
    )
  } catch (error) {
    logger.error('Failed to send password reset email', error)
    throw new AppError('Failed to send reset email', 500)
  }

  return { message: 'If the email exists, a reset link has been sent' }
}

/**
 * Reset password
 */
/**
 * Reset password using reset token
 * 
 * Business Logic:
 * - Validates reset token and expiration
 * - Prevents token reuse
 * - Hashes new password
 * - Revokes all refresh tokens (forces re-login)
 * 
 * @param token - Password reset token
 * @param newPassword - New password
 * @returns Success message
 */
export async function resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
  const reset = await prisma.passwordReset.findUnique({
    where: { token },
    include: { user: true },
  })

  if (!reset) {
    throw new AppError('Invalid reset token', 400)
  }

  if (reset.used) {
    throw new AppError('Reset token has already been used', 400)
  }

  if (reset.expiresAt < new Date()) {
    throw new AppError('Reset token has expired', 400)
  }

  // Hash new password
  const hashedPassword = await bcrypt.hash(newPassword, 12)

  // Update user password and mark reset as used
  await prisma.$transaction([
    prisma.user.update({
      where: { id: reset.userId },
      data: { password: hashedPassword },
    }),
    prisma.passwordReset.update({
      where: { id: reset.id },
      data: {
        used: true,
        usedAt: new Date(),
      },
    }),
    // Revoke all refresh tokens for security
    prisma.refreshToken.updateMany({
      where: { userId: reset.userId },
      data: { isRevoked: true },
    }),
  ])

  return { message: 'Password reset successfully' }
}

/**
 * Get current user
 */
export async function getCurrentUser(userId: string) {
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
    roles: user.roles.map((ur: { role: { name: string } }) => ur.role.name),
  }
}
