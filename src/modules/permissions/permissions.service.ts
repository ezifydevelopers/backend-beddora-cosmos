import prisma from '../../config/db'
import { AppError } from '../../middlewares/error.middleware'
import {
  PermissionResponse,
  PermissionCheckData,
  UpdateUserPermissionsData,
  RoleAssignment,
  ScopeType,
} from '../../types/permission.types'

/**
 * Permissions service
 * Handles all business logic for permissions management
 * 
 * Business Logic:
 * - Role-based permissions (inherited from user roles)
 * - User-specific permissions (override role permissions)
 * - Account-scoped permissions (permission can be limited to specific account)
 * - Permission checking with proper precedence (user > role)
 */

/**
 * Get user permissions (role-based + user-specific)
 * 
 * Business Logic:
 * - Collects permissions from all user roles
 * - Merges with user-specific permissions (user permissions override role permissions)
 * - Returns both permissions object and role names
 * 
 * @param userId - The ID of the user
 * @param accountId - Optional account ID for account-scoped permissions
 * @returns Permissions object and user roles
 */
export async function getUserPermissions(userId: string, accountId?: string): Promise<PermissionResponse> {
  // Get user roles
  const userRoles = await prisma.userRole.findMany({
    where: { userId },
    include: {
      role: {
        include: {
          permissions: {
            include: {
              permission: true,
            },
          },
        },
      },
    },
  })

  // Get role-based permissions
  const rolePermissions = new Map<string, string>()
  userRoles.forEach((ur) => {
    ur.role.permissions.forEach((rp) => {
      const key = `${rp.permission.resource}.${rp.permission.action}`
      rolePermissions.set(key, rp.permission.name)
    })
  })

  // Get user-specific permissions (override role permissions)
  const userPermissions = await prisma.userPermission.findMany({
    where: {
      userId,
      accountId: accountId || null,
    },
    include: {
      permission: true,
    },
  })

  // Build permissions object
  const permissions: Record<string, string> = {}

  // Add role permissions
  rolePermissions.forEach((name, key) => {
    permissions[key] = name
  })

  // Override with user-specific permissions
  userPermissions.forEach((up) => {
    const key = `${up.permission.resource}.${up.permission.action}`
    permissions[key] = up.permission.name
  })

  return {
    permissions,
    roles: userRoles.map((ur) => ur.role.name),
  }
}

/**
 * Check if user has permission
 * 
 * Business Logic:
 * - Checks user-specific permissions first (highest priority)
 * - Falls back to role-based permissions
 * - Supports account-scoped permission checks
 * 
 * @param userId - The ID of the user
 * @param resource - Resource name (e.g., 'profit', 'inventory')
 * @param action - Action name (e.g., 'read', 'write')
 * @param accountId - Optional account ID for account-scoped checks
 * @returns True if user has permission, false otherwise
 */
export async function hasPermission(data: {
  userId: string
  resource: string
  action: string
  accountId?: string
  marketplaceId?: string
  productId?: string
  scope?: ScopeType
}): Promise<boolean> {
  const { userId, resource, action, accountId, marketplaceId, productId, scope } = data
  // Get permission
  const permission = await prisma.permission.findFirst({
    where: {
      resource,
      action,
      ...(scope ? { scope } : {}),
    },
  })

  if (!permission) {
    return false
  }

  // Check user-specific permission first
  const userPermission = await prisma.userPermission.findFirst({
    where: {
      userId,
      permissionId: permission.id,
      accountId: accountId || null,
    },
  })

  if (userPermission) {
    return true // User has explicit permission
  }

  // Check role-based permissions
  const userRoles = await prisma.userRole.findMany({
    where: { userId, ...(accountId ? { accountId } : {}) },
    include: {
      role: {
        include: {
          permissions: {
            where: {
              permissionId: permission.id,
              ...(marketplaceId ? { marketplaceId } : {}),
              ...(productId ? { productId } : {}),
            },
          },
        },
      },
    },
  })

  return userRoles.some((ur) => ur.role.permissions.length > 0)
}

/**
 * Update user permissions (admin only)
 * 
 * Business Logic:
 * - Verifies admin has permission to manage permissions
 * - Replaces all existing user-specific permissions
 * - Creates new permission records for the user
 * - Supports account-scoped permissions
 * 
 * Security:
 * - Requires 'permissions:write' permission
 * - Prevents privilege escalation
 * 
 * @param adminUserId - The ID of the admin user performing the action
 * @param targetUserId - The ID of the user whose permissions are being updated
 * @param permissions - Array of permission objects to assign
 * @returns Success message
 */
export async function updateUserPermissions(
  adminUserId: string,
  targetUserId: string,
  permissions: UpdateUserPermissionsData[],
  roles?: RoleAssignment[]
): Promise<{ message: string }> {
  // Verify admin has permission to manage permissions
  const isAdmin = await hasPermission({ userId: adminUserId, resource: 'permissions', action: 'write' })
  if (!isAdmin) {
    throw new AppError('Insufficient permissions', 403)
  }

  // Update roles if provided
  if (roles) {
    await prisma.userRole.deleteMany({ where: { userId: targetUserId } })
    if (roles.length > 0) {
      await prisma.userRole.createMany({
        data: roles.map((r) => ({
          userId: targetUserId,
          roleId: r.roleId,
          accountId: r.accountId || null,
        })),
      })
    }
  }

  // Delete existing user permissions
  await prisma.userPermission.deleteMany({
    where: { userId: targetUserId },
  })

  // Create new permissions
  for (const perm of permissions) {
    const permission = await prisma.permission.findFirst({
      where: {
        resource: perm.resource,
        action: perm.action,
        ...(perm.scope ? { scope: perm.scope } : {}),
      },
    })

    if (permission) {
      await prisma.userPermission.create({
        data: {
          userId: targetUserId,
          permissionId: permission.id,
          accountId: perm.accountId || null,
        },
      })
    }
  }

  return { message: 'Permissions updated successfully' }
}

export async function listRoles() {
  return prisma.role.findMany({
    orderBy: { name: 'asc' },
    include: { permissions: { include: { permission: true } } },
  })
}

export async function createRole(name: string, description?: string) {
  return prisma.role.create({
    data: { name, description },
  })
}

export async function createPermission(data: {
  name: string
  resource: string
  action: string
  scope?: ScopeType
  description?: string
}) {
  return prisma.permission.create({
    data: {
      name: data.name,
      resource: data.resource,
      action: data.action,
      scope: data.scope || 'GLOBAL',
      description: data.description,
    },
  })
}
