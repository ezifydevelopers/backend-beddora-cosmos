/**
 * Permission-related type definitions
 */

/**
 * Permission response
 */
export interface PermissionResponse {
  permissions: Record<string, string>
  roles: string[]
}

/**
 * Permission check data
 */
export interface PermissionCheckData {
  resource: string
  action: string
  accountId?: string
}

/**
 * Update user permissions data
 */
export interface UpdateUserPermissionsData {
  resource: string
  action: string
  accountId?: string
}
