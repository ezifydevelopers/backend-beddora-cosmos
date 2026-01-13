/**
 * User-related type definitions
 */

/**
 * User profile update data
 */
export interface UpdateUserProfileData {
  name?: string
  email?: string
}

/**
 * Change password data
 */
export interface ChangePasswordData {
  currentPassword: string
  newPassword: string
}

/**
 * User profile response
 */
export interface UserProfileResponse {
  id: string
  email: string
  name: string | null
  isActive: boolean
  emailVerified: boolean
  roles: string[]
  createdAt: Date
  updatedAt: Date
}
