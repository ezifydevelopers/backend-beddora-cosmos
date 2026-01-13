/**
 * Authentication-related type definitions
 */

/**
 * User registration data
 */
export interface RegisterData {
  email: string
  password: string
  name?: string
  acceptTerms: boolean
  acceptPrivacy: boolean
}

/**
 * User login data
 */
export interface LoginData {
  email: string
  password: string
}

/**
 * JWT token payload
 * 
 * Note: Uses `activeAccountId` to support multi-account switching
 */
export interface TokenPayload {
  userId: string
  email: string
  roles: string[]
  activeAccountId?: string
}

/**
 * Authentication response
 */
export interface AuthResponse {
  user: {
    id: string
    email: string
    name: string | null
    emailVerified: boolean
    roles: string[]
  }
  accessToken: string
  refreshToken: string
  activeAccountId: string | null
}

/**
 * Refresh token response
 */
export interface RefreshTokenResponse {
  accessToken: string
  refreshToken: string
}

/**
 * Password reset request data
 */
export interface PasswordResetRequestData {
  email: string
}

/**
 * Password reset data
 */
export interface PasswordResetData {
  token: string
  password: string
}

/**
 * Email verification data
 */
export interface EmailVerificationData {
  token: string
}
