import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * Seed script for initial database data
 * Run with: npm run prisma:seed
 * 
 * Creates:
 * - Default roles (ADMIN, MANAGER, VIEWER)
 * - Default permissions for all resources
 * - Default marketplace (Amazon)
 */
async function main() {
  console.log('🌱 Seeding database...')

  // Create default roles
  const adminRole = await prisma.role.upsert({
    where: { name: 'ADMIN' },
    update: {},
    create: {
      name: 'ADMIN',
      description: 'Administrator with full access to all features',
    },
  })

  const managerRole = await prisma.role.upsert({
    where: { name: 'MANAGER' },
    update: {},
    create: {
      name: 'MANAGER',
      description: 'Manager with read/write access to most features',
    },
  })

  const viewerRole = await prisma.role.upsert({
    where: { name: 'VIEWER' },
    update: {},
    create: {
      name: 'VIEWER',
      description: 'Viewer with read-only access',
    },
  })

  console.log('✅ Roles created')

  // Create permissions for all resources
  const resources = ['profit', 'inventory', 'ppc', 'alerts', 'reports', 'accounts', 'permissions']
  const actions = ['read', 'write', 'delete']

  const permissions: Array<{ name: string; resource: string; action: string; description: string }> = []

  for (const resource of resources) {
    for (const action of actions) {
      const name = `${resource}.${action}`
      permissions.push({
        name,
        resource,
        action,
        description: `Permission to ${action} ${resource}`,
      })
    }
  }

  // Create all permissions
  const createdPermissions = await Promise.all(
    permissions.map((perm) =>
      prisma.permission.upsert({
        where: { name: perm.name },
        update: {},
        create: perm,
      })
    )
  )

  console.log('✅ Permissions created')

  // Assign permissions to roles
  // ADMIN: All permissions
  for (const permission of createdPermissions) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: adminRole.id,
          permissionId: permission.id,
        },
      },
      update: {},
      create: {
        roleId: adminRole.id,
        permissionId: permission.id,
      },
    })
  }

  // MANAGER: Read and write (no delete)
  const managerPermissions = createdPermissions.filter(
    (p) => p.action !== 'delete' || p.resource === 'permissions'
  )
  for (const permission of managerPermissions) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: managerRole.id,
          permissionId: permission.id,
        },
      },
      update: {},
      create: {
        roleId: managerRole.id,
        permissionId: permission.id,
      },
    })
  }

  // VIEWER: Read only
  const viewerPermissions = createdPermissions.filter((p) => p.action === 'read')
  for (const permission of viewerPermissions) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: viewerRole.id,
          permissionId: permission.id,
        },
      },
      update: {},
      create: {
        roleId: viewerRole.id,
        permissionId: permission.id,
      },
    })
  }

  console.log('✅ Role permissions assigned')

  // Create default marketplace
  const amazonMarketplace = await prisma.marketplace.upsert({
    where: { code: 'amazon' },
    update: {},
    create: {
      name: 'Amazon',
      code: 'amazon',
      region: 'us',
      isActive: true,
    },
  })

  console.log('✅ Marketplaces created')

  console.log('🎉 Seeding completed!')
  console.log('\n📋 Summary:')
  console.log(`  - Roles: ADMIN, MANAGER, VIEWER`)
  console.log(`  - Permissions: ${createdPermissions.length} permissions created`)
  console.log(`  - Marketplaces: Amazon`)
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
