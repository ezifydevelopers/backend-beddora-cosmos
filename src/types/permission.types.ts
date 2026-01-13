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

export type ScopeType = 'GLOBAL' | 'MARKETPLACE' | 'PRODUCT'

/**
 * Permission check data
 */
export interface PermissionCheckData {
  resource: string
  action: string
  accountId?: string
  marketplaceId?: string
  productId?: string
  scope?: ScopeType
}

/**
 * Update user permissions data
 */
export interface UpdateUserPermissionsData {
  resource: string
  action: string
  accountId?: string
  marketplaceId?: string
  productId?: string
  scope?: ScopeType
}

export interface RoleAssignment {
  roleId: string
  accountId?: string
}
