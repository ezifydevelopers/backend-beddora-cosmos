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

  // Assign permissions to roles using createMany with skipDuplicates
  // ADMIN: All permissions
  await prisma.rolePermission.createMany({
    data: createdPermissions.map((permission) => ({
      roleId: adminRole.id,
      permissionId: permission.id,
      marketplaceId: null,
      productId: null,
    })),
    skipDuplicates: true,
  })

  // MANAGER: Read and write (no delete, except permissions delete allowed)
  const managerPermissions = createdPermissions.filter(
    (p) => p.action !== 'delete' || p.resource === 'permissions'
  )
  await prisma.rolePermission.createMany({
    data: managerPermissions.map((permission) => ({
      roleId: managerRole.id,
      permissionId: permission.id,
      marketplaceId: null,
      productId: null,
    })),
    skipDuplicates: true,
  })

  // VIEWER: Read only
  const viewerPermissions = createdPermissions.filter((p) => p.action === 'read')
  await prisma.rolePermission.createMany({
    data: viewerPermissions.map((permission) => ({
      roleId: viewerRole.id,
      permissionId: permission.id,
      marketplaceId: null,
      productId: null,
    })),
    skipDuplicates: true,
  })

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
