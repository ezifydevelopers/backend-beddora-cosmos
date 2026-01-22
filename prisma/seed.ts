import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

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
  const resources = ['profit', 'inventory', 'ppc', 'alerts', 'reports', 'accounts', 'permissions', 'emails']
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

  // Create default marketplaces
  const amazonMarketplace = await prisma.marketplace.upsert({
    where: { code: 'amazon' },
    update: {},
    create: {
      name: 'Amazon',
      code: 'amazon',
      region: 'us',
      isActive: true,
      baseCurrency: 'USD',
    },
  })

  const amazonUs = await prisma.marketplace.upsert({
    where: { code: 'amazon-us' },
    update: {},
    create: {
      name: 'Amazon US',
      code: 'amazon-us',
      region: 'us',
      isActive: true,
      baseCurrency: 'USD',
    },
  })

  const amazonUk = await prisma.marketplace.upsert({
    where: { code: 'amazon-uk' },
    update: {},
    create: {
      name: 'Amazon UK',
      code: 'amazon-uk',
      region: 'uk',
      isActive: true,
      baseCurrency: 'GBP',
    },
  })

  const amazonCa = await prisma.marketplace.upsert({
    where: { code: 'amazon-ca' },
    update: {},
    create: {
      name: 'Amazon.ca',
      code: 'amazon-ca',
      region: 'ca',
      isActive: true,
      baseCurrency: 'CAD',
    },
  })

  console.log('✅ Marketplaces created')

  // Create demo account and user for mock data (if not exists)
  const existingAccount = await prisma.account.findFirst({
    where: { name: 'Demo Account' },
  })

  const demoAccount =
    existingAccount ||
    (await prisma.account.create({
      data: {
        name: 'Demo Account',
        sellerId: 'SELLER-DEMO',
        region: 'us',
        isActive: true,
      },
    }))

  const demoEmail = 'demo@beddora.io'
  const existingUser = await prisma.user.findUnique({ where: { email: demoEmail } })
  const demoUser =
    existingUser ||
    (await prisma.user.create({
      data: {
        email: demoEmail,
        name: 'Demo User',
        password: await bcrypt.hash('Demo123!', 12),
        isActive: true,
        isVerified: true,
      },
    }))

  await prisma.userAccount.upsert({
    where: {
      userId_accountId: {
        userId: demoUser.id,
        accountId: demoAccount.id,
      },
    },
    update: {},
    create: {
      userId: demoUser.id,
      accountId: demoAccount.id,
      isActive: true,
      isDefault: true,
    },
  })

  await prisma.userRole.upsert({
    where: {
      userId_roleId_accountId: {
        userId: demoUser.id,
        roleId: adminRole.id,
        accountId: demoAccount.id,
      },
    },
    update: {},
    create: {
      userId: demoUser.id,
      roleId: adminRole.id,
      accountId: demoAccount.id,
    },
  })

  const demoAmazonAccount = await prisma.amazonAccount.upsert({
    where: {
      userId_marketplace: {
        userId: demoUser.id,
        marketplace: 'US',
      },
    },
    update: {
      sellerId: 'SELLER-DEMO-US',
      amazonSellerId: 'SELLER-DEMO-US',
      lwaClientId: 'demo-lwa-client-id',
      lwaClientSecret: 'demo-lwa-client-secret',
      refreshToken: 'demo-refresh-token',
      accessKey: 'demo-access-key',
      secretKey: 'demo-secret-key',
      isActive: true,
    },
    create: {
      userId: demoUser.id,
      marketplace: 'US',
      sellerId: 'SELLER-DEMO-US',
      amazonSellerId: 'SELLER-DEMO-US',
      lwaClientId: 'demo-lwa-client-id',
      lwaClientSecret: 'demo-lwa-client-secret',
      refreshToken: 'demo-refresh-token',
      accessKey: 'demo-access-key',
      secretKey: 'demo-secret-key',
      isActive: true,
    },
  })

  // Link marketplaces to account
  await prisma.accountMarketplace.createMany({
    data: [
      { accountId: demoAccount.id, marketplaceId: amazonMarketplace.id },
      { accountId: demoAccount.id, marketplaceId: amazonUs.id },
      { accountId: demoAccount.id, marketplaceId: amazonUk.id },
      { accountId: demoAccount.id, marketplaceId: amazonCa.id },
    ],
    skipDuplicates: true,
  })

  // Seed inventory stock mock data
  const inventorySeed = [
    { sku: 'SKU-1001', marketplaceId: amazonUs.id, quantityAvailable: 120, quantityReserved: 8, lowStockThreshold: 25 },
    { sku: 'SKU-1002', marketplaceId: amazonUs.id, quantityAvailable: 14, quantityReserved: 4, lowStockThreshold: 20 },
    { sku: 'SKU-1003', marketplaceId: amazonUs.id, quantityAvailable: 0, quantityReserved: 0, lowStockThreshold: 15 },
    { sku: 'SKU-2001', marketplaceId: amazonUk.id, quantityAvailable: 62, quantityReserved: 5, lowStockThreshold: 18 },
    { sku: 'SKU-2002', marketplaceId: amazonUk.id, quantityAvailable: 9, quantityReserved: 2, lowStockThreshold: 12 },
    { sku: 'SKU-3001', marketplaceId: amazonMarketplace.id, quantityAvailable: 210, quantityReserved: 20, lowStockThreshold: 40 },
  ]

  for (const item of inventorySeed) {
    await prisma.inventoryStock.upsert({
      where: {
        accountId_sku_marketplaceId: {
          accountId: demoAccount.id,
          sku: item.sku,
          marketplaceId: item.marketplaceId,
        },
      },
      update: {
        quantityAvailable: item.quantityAvailable,
        quantityReserved: item.quantityReserved,
        lowStockThreshold: item.lowStockThreshold,
        lastSyncedAt: new Date(),
      },
      create: {
        accountId: demoAccount.id,
        sku: item.sku,
        marketplaceId: item.marketplaceId,
        quantityAvailable: item.quantityAvailable,
        quantityReserved: item.quantityReserved,
        lowStockThreshold: item.lowStockThreshold,
        lastSyncedAt: new Date(),
      },
    })
  }

  // Seed demo products - Expanded product catalog
  const productSeeds = [
    { sku: 'SKU-1001', title: 'Beddora Cozy Throw Blanket - Soft Fluffy Fleece Plush Blanket for Couch', currentPrice: 79.99, cost: 32.5, quantity: 120 },
    { sku: 'SKU-1002', title: 'Beddora Throw Pillows, Pillow Inserts for Sofa, Bed and Couch Decorative', currentPrice: 29.99, cost: 10.5, quantity: 60 },
    { sku: 'SKU-1003', title: 'Beddora Bed Pillows for Sleeping, Gusseted Hotel Quality Pillows, Cooling', currentPrice: 49.0, cost: 18.25, quantity: 30 },
    { sku: 'SKU-1004', title: 'Duvet Cover Set - Soft Brushed Microfiber 3 Piece Bedding Set', currentPrice: 39.99, cost: 15.75, quantity: 85 },
    { sku: 'SKU-1005', title: 'Pillow Protectors Pack of 4 - Waterproof Zippered Pillow Covers', currentPrice: 31.99, cost: 12.85, quantity: 95 },
    { sku: 'SKU-1006', title: 'Mattress Pad Cover - Breathable Quilted Fitted Mattress Topper', currentPrice: 45.99, cost: 19.25, quantity: 45 },
    { sku: 'SKU-1007', title: 'Weighted Blanket for Adults - Heavy Blanket for Better Sleep', currentPrice: 89.99, cost: 38.5, quantity: 28 },
    { sku: 'SKU-1008', title: 'Memory Foam Pillows Set of 2 - Adjustable Loft Bed Pillows', currentPrice: 59.99, cost: 24.5, quantity: 52 },
    // Products matching reference image
    { sku: 'B0F4RTTQXQ', title: 'Beddora Black Velvet Hangers 50 Pack, Heavy Duty Non-Slip Velvet Hangers for Closet, Space Saving Clothes Hangers for Dresses, Suits, Jackets', currentPrice: 27.49, cost: 4.52, quantity: 150 },
    { sku: 'B0FNBXLBWJ', title: 'Beddora 2 Pack Pillow Protectors King Size, Waterproof Pillow Protector Zippered, Hypoallergenic Pillow Covers for Bed Pillows', currentPrice: 24.99, cost: 6.90, quantity: 80 },
    { sku: 'B0DG63T1DL', title: 'BEDDORA Queen Bed Sheets Set, 4 Piece Bedding Set with Deep Pocket Fitted Sheet, Flat Sheet, 2 Pillowcases, Soft Microfiber Bed Sheets', currentPrice: 34.99, cost: 6.90, quantity: 100 },
  ]

  const products = []
  for (const seed of productSeeds) {
    const product = await prisma.product.upsert({
      where: {
        accountId_sku: {
          accountId: demoAccount.id,
          sku: seed.sku,
        },
      },
      update: {
        title: seed.title,
        currentPrice: seed.currentPrice,
        cost: seed.cost,
        quantity: seed.quantity,
      },
      create: {
        accountId: demoAccount.id,
        sku: seed.sku,
        title: seed.title,
        currentPrice: seed.currentPrice,
        cost: seed.cost,
        quantity: seed.quantity,
        status: 'active',
      },
    })
    products.push(product)
  }

  // Seed demo orders (last 30 days) - Comprehensive data for Profit Dashboard
  const now = new Date()
  const ordersSeed = [
    // Today
    { orderId: 'ORDER-TODAY-1', daysAgo: 0, totalAmount: 82.47, shippingCost: 0, tax: 5.5, status: 'pending' },
    // Yesterday
    { orderId: 'ORDER-YD-1', daysAgo: 1, totalAmount: 159.98, shippingCost: 0, tax: 10.5, status: 'shipped' },
    { orderId: 'ORDER-YD-2', daysAgo: 1, totalAmount: 139.95, shippingCost: 0, tax: 9.2, status: 'shipped' },
    { orderId: 'ORDER-YD-3', daysAgo: 1, totalAmount: 1272.47, shippingCost: 12.5, tax: 84.8, status: 'shipped' },
    // Last 7 days
    { orderId: 'ORDER-1001', daysAgo: 2, totalAmount: 239.97, shippingCost: 8.5, tax: 15.8, status: 'shipped' },
    { orderId: 'ORDER-1002', daysAgo: 3, totalAmount: 329.96, shippingCost: 10.0, tax: 21.5, status: 'shipped' },
    { orderId: 'ORDER-1003', daysAgo: 4, totalAmount: 449.95, shippingCost: 12.5, tax: 29.5, status: 'delivered' },
    { orderId: 'ORDER-1004', daysAgo: 5, totalAmount: 789.90, shippingCost: 15.0, tax: 52.0, status: 'delivered' },
    { orderId: 'ORDER-1005', daysAgo: 6, totalAmount: 559.92, shippingCost: 11.5, tax: 36.8, status: 'delivered' },
    // Last 14 days (7-14 days ago)
    { orderId: 'ORDER-1006', daysAgo: 7, totalAmount: 229.97, shippingCost: 8.0, tax: 15.1, status: 'delivered' },
    { orderId: 'ORDER-1007', daysAgo: 8, totalAmount: 439.94, shippingCost: 12.0, tax: 28.9, status: 'delivered' },
    { orderId: 'ORDER-1008', daysAgo: 9, totalAmount: 679.93, shippingCost: 14.5, tax: 44.7, status: 'delivered' },
    { orderId: 'ORDER-1009', daysAgo: 10, totalAmount: 319.96, shippingCost: 9.5, tax: 21.0, status: 'delivered' },
    { orderId: 'ORDER-1010', daysAgo: 11, totalAmount: 889.91, shippingCost: 16.0, tax: 58.5, status: 'delivered' },
    { orderId: 'ORDER-1011', daysAgo: 12, totalAmount: 489.95, shippingCost: 12.5, tax: 32.2, status: 'delivered' },
    { orderId: 'ORDER-1012', daysAgo: 13, totalAmount: 609.94, shippingCost: 13.5, tax: 40.0, status: 'delivered' },
    // Last 30 days (14-30 days ago)
    { orderId: 'ORDER-1013', daysAgo: 14, totalAmount: 379.96, shippingCost: 10.5, tax: 25.0, status: 'delivered' },
    { orderId: 'ORDER-1014', daysAgo: 15, totalAmount: 729.92, shippingCost: 14.5, tax: 48.0, status: 'delivered' },
    { orderId: 'ORDER-1015', daysAgo: 16, totalAmount: 259.97, shippingCost: 9.0, tax: 17.1, status: 'delivered' },
    { orderId: 'ORDER-1016', daysAgo: 18, totalAmount: 549.94, shippingCost: 12.5, tax: 36.1, status: 'delivered' },
    { orderId: 'ORDER-1017', daysAgo: 20, totalAmount: 989.90, shippingCost: 17.5, tax: 65.0, status: 'delivered' },
    { orderId: 'ORDER-1018', daysAgo: 22, totalAmount: 419.95, shippingCost: 11.5, tax: 27.6, status: 'delivered' },
    { orderId: 'ORDER-1019', daysAgo: 24, totalAmount: 669.93, shippingCost: 14.0, tax: 44.0, status: 'delivered' },
    { orderId: 'ORDER-1020', daysAgo: 26, totalAmount: 289.97, shippingCost: 9.5, tax: 19.0, status: 'delivered' },
    { orderId: 'ORDER-1021', daysAgo: 28, totalAmount: 829.91, shippingCost: 15.5, tax: 54.5, status: 'delivered' },
    { orderId: 'ORDER-1022', daysAgo: 29, totalAmount: 459.95, shippingCost: 12.0, tax: 30.2, status: 'delivered' },
  ]

  const orders = []
  for (const seed of ordersSeed) {
    const orderDate = new Date(now.getTime() - seed.daysAgo * 24 * 60 * 60 * 1000)
    const order = await prisma.order.upsert({
      where: { orderId: seed.orderId },
      update: {
        orderDate,
        orderStatus: seed.status,
        totalAmount: seed.totalAmount,
        shippingCost: seed.shippingCost,
        tax: seed.tax,
        marketplaceId: amazonUs.id,
      },
      create: {
        accountId: demoAccount.id,
        marketplaceId: amazonUs.id,
        orderId: seed.orderId,
        orderDate,
        orderStatus: seed.status,
        totalAmount: seed.totalAmount,
        shippingCost: seed.shippingCost,
        tax: seed.tax,
        currency: 'USD',
      },
    })
    orders.push(order)
  }

  const orderIds = orders.map((order) => order.id)
  if (orderIds.length > 0) {
    await prisma.orderItem.deleteMany({
      where: {
        orderId: { in: orderIds },
      },
    })
    await prisma.fee.deleteMany({
      where: {
        orderId: { in: orderIds },
      },
    })
  }

  // Create order items for all orders
  const orderItems = []
  for (let i = 0; i < orders.length; i++) {
    const order = orders[i]
    const numItems = Math.floor(Math.random() * 3) + 1 // 1-3 items per order
    
    for (let j = 0; j < numItems; j++) {
      const product = products[Math.floor(Math.random() * products.length)]
      const quantity = Math.floor(Math.random() * 4) + 1 // 1-4 quantity
      const unitPrice = product.currentPrice
      const totalPrice = unitPrice * quantity
      
      orderItems.push({
        orderId: order.id,
        productId: product.id,
        sku: product.sku,
        quantity,
        unitPrice,
        totalPrice,
      })
    }
  }

  await prisma.orderItem.createMany({
    data: orderItems,
  })

  // Create fees for all orders (Amazon takes ~15% referral + $2-5 FBA per item)
  const fees = []
  for (const order of orders) {
    const referralFee = order.totalAmount * 0.15 // 15% referral fee
    const fbaFee = Math.random() * 3 + 2 // $2-5 FBA fee
    
    fees.push(
      { orderId: order.id, feeType: 'Referral', amount: referralFee, description: 'Amazon referral fee' },
      { orderId: order.id, feeType: 'FBA', amount: fbaFee, description: 'FBA fulfillment fee' }
    )
  }

  await prisma.fee.createMany({
    data: fees,
  })

  // Seed Canadian orders (Amazon.ca) matching reference image
  // Note: These orders are created after the main orders to ensure products exist
  const canadianOrdersSeed = [
    { 
      orderId: '701-4662378-2080222', 
      daysAgo: 0, 
      totalAmount: 27.49, 
      shippingCost: 0, 
      tax: 3.57, 
      status: 'unshipped',
      orderDate: new Date('2026-01-18T21:43:00'),
    },
    { 
      orderId: '701-4662378-2080223', 
      daysAgo: 0, 
      totalAmount: 24.99, 
      shippingCost: 0, 
      tax: 3.25, 
      status: 'shipped',
      orderDate: new Date('2026-01-18T20:15:00'),
    },
    { 
      orderId: '701-4662378-2080224', 
      daysAgo: 0, 
      totalAmount: 34.99, 
      shippingCost: 0, 
      tax: 4.55, 
      status: 'unshipped',
      orderDate: new Date('2026-01-18T19:30:00'),
    },
    { 
      orderId: '701-4662378-2080225', 
      daysAgo: 0, 
      totalAmount: 54.98, 
      shippingCost: 0, 
      tax: 7.15, 
      status: 'shipped',
      orderDate: new Date('2026-01-18T18:20:00'),
    },
    { 
      orderId: '701-4662378-2080226', 
      daysAgo: 0, 
      totalAmount: 24.99, 
      shippingCost: 0, 
      tax: 3.25, 
      status: 'unshipped',
      orderDate: new Date('2026-01-18T17:45:00'),
    },
    { 
      orderId: '701-4662378-2080227', 
      daysAgo: 0, 
      totalAmount: 24.99, 
      shippingCost: 0, 
      tax: 3.25, 
      status: 'shipped',
      orderDate: new Date('2026-01-18T16:10:00'),
    },
    { 
      orderId: '701-4662378-2080228', 
      daysAgo: 0, 
      totalAmount: 27.49, 
      shippingCost: 0, 
      tax: 3.57, 
      status: 'unshipped',
      orderDate: new Date('2026-01-18T15:30:00'),
    },
  ]

  const canadianOrders = []
  for (const seed of canadianOrdersSeed) {
    const order = await prisma.order.upsert({
      where: { orderId: seed.orderId },
      update: {
        orderDate: seed.orderDate,
        orderStatus: seed.status,
        totalAmount: seed.totalAmount,
        shippingCost: seed.shippingCost,
        tax: seed.tax,
        marketplaceId: amazonCa.id,
        currency: 'CAD',
      },
      create: {
        accountId: demoAccount.id,
        marketplaceId: amazonCa.id,
        orderId: seed.orderId,
        orderDate: seed.orderDate,
        orderStatus: seed.status,
        totalAmount: seed.totalAmount,
        shippingCost: seed.shippingCost,
        tax: seed.tax,
        currency: 'CAD',
        shipDate: seed.status === 'shipped' ? new Date(seed.orderDate.getTime() + 24 * 60 * 60 * 1000) : null,
      },
    })
    canadianOrders.push(order)
  }

  // Create order items for Canadian orders
  const canadianOrderItemsData = [
    // Order 701-4662378-2080222 - Black Velvet Hangers
    {
      orderId: canadianOrders[0].id,
      sku: 'B0F4RTTQXQ',
      quantity: 1,
      unitPrice: 27.49,
      totalPrice: 27.49,
    },
    // Order 701-4662378-2080223 - Pillow Protectors
    {
      orderId: canadianOrders[1].id,
      sku: 'B0FNBXLBWJ',
      quantity: 1,
      unitPrice: 24.99,
      totalPrice: 24.99,
    },
    // Order 701-4662378-2080224 - Bed Sheets
    {
      orderId: canadianOrders[2].id,
      sku: 'B0DG63T1DL',
      quantity: 1,
      unitPrice: 34.99,
      totalPrice: 34.99,
    },
    // Order 701-4662378-2080225 - Black Velvet Hangers (2 units)
    {
      orderId: canadianOrders[3].id,
      sku: 'B0F4RTTQXQ',
      quantity: 2,
      unitPrice: 27.49,
      totalPrice: 54.98,
    },
    // Order 701-4662378-2080226 - Pillow Protectors
    {
      orderId: canadianOrders[4].id,
      sku: 'B0FNBXLBWJ',
      quantity: 1,
      unitPrice: 24.99,
      totalPrice: 24.99,
    },
    // Order 701-4662378-2080227 - Pillow Protectors
    {
      orderId: canadianOrders[5].id,
      sku: 'B0FNBXLBWJ',
      quantity: 1,
      unitPrice: 24.99,
      totalPrice: 24.99,
    },
    // Order 701-4662378-2080228 - Black Velvet Hangers
    {
      orderId: canadianOrders[6].id,
      sku: 'B0F4RTTQXQ',
      quantity: 1,
      unitPrice: 27.49,
      totalPrice: 27.49,
    },
  ]

  // Get product IDs for Canadian products
  const canadianProducts = await prisma.product.findMany({
    where: {
      accountId: demoAccount.id,
      sku: { in: ['B0F4RTTQXQ', 'B0FNBXLBWJ', 'B0DG63T1DL'] },
    },
  })

  const productMap = new Map(canadianProducts.map(p => [p.sku, p.id]))

  const canadianOrderItems = canadianOrderItemsData.map(item => ({
    orderId: item.orderId,
    productId: productMap.get(item.sku) || products[0].id, // Fallback to first product if not found
    sku: item.sku,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    totalPrice: item.totalPrice,
  }))

  await prisma.orderItem.createMany({
    data: canadianOrderItems,
  })

  // Create fees for Canadian orders (Amazon.ca fees are typically higher)
  const canadianFees = []
  for (const order of canadianOrders) {
    const referralFee = order.totalAmount * 0.15 // 15% referral fee
    const fbaFee = Math.random() * 3 + 3 // $3-6 FBA fee (higher for Canada)
    
    canadianFees.push(
      { orderId: order.id, feeType: 'Referral', amount: referralFee, description: 'Amazon.ca referral fee' },
      { orderId: order.id, feeType: 'FBA', amount: fbaFee, description: 'FBA fulfillment fee' }
    )
  }

  await prisma.fee.createMany({
    data: canadianFees,
  })

  // Create some refunds for different periods
  const refunds = [
    { orderId: orders[1]?.id, refundId: 'REFUND-YD-1', amount: 29.99, daysAgo: 1 }, // Yesterday
    { orderId: orders[5]?.id, refundId: 'REFUND-1002', amount: 79.99, daysAgo: 3 }, // Last 7 days
    { orderId: orders[8]?.id, refundId: 'REFUND-1005', amount: 49.00, daysAgo: 6 }, // Last 7 days
    { orderId: orders[12]?.id, refundId: 'REFUND-1009', amount: 59.99, daysAgo: 10 }, // Last 14 days
    { orderId: orders[18]?.id, refundId: 'REFUND-1015', amount: 89.97, daysAgo: 16 }, // Last 30 days
    { orderId: orders[22]?.id, refundId: 'REFUND-1019', amount: 129.98, daysAgo: 24 }, // Last 30 days
  ].filter(r => r.orderId) // Only include if order exists

  for (const refundData of refunds) {
    await prisma.refund.upsert({
      where: { refundId: refundData.refundId },
      update: {
        amount: refundData.amount,
        status: 'processed',
      },
      create: {
        orderId: refundData.orderId,
        refundId: refundData.refundId,
        amount: refundData.amount,
        reason: 'Customer return',
        reasonCode: 'RETURNED',
        status: 'processed',
        refundDate: new Date(now.getTime() - refundData.daysAgo * 24 * 60 * 60 * 1000),
        processedAt: new Date(now.getTime() - (refundData.daysAgo - 1) * 24 * 60 * 60 * 1000),
      },
    })
  }

  await prisma.return.deleteMany({
    where: {
      accountId: demoAccount.id,
      sku: { in: products.map((product) => product.sku) },
    },
  })

  await prisma.return.create({
    data: {
      orderId: orders[2].id,
      sku: products[1].sku,
      accountId: demoAccount.id,
      marketplaceId: amazonUs.id,
      quantityReturned: 1,
      reasonCode: 'DAMAGED',
      refundAmount: 29.99,
      feeAmount: 2.5,
      isSellable: false,
    },
  })

  await prisma.expense.deleteMany({
    where: {
      accountId: demoAccount.id,
      description: { startsWith: 'Seed:' },
    },
  })

  // Create advertising expenses (PPC) for different time periods
  const adExpenses = []
  for (let daysAgo = 0; daysAgo < 30; daysAgo++) {
    const expenseDate = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000)
    const dailyAdSpend = Math.random() * 50 + 20 // $20-$70 per day
    
    adExpenses.push({
      accountId: demoAccount.id,
      marketplaceId: amazonUs.id,
      type: 'recurring',
      category: 'Advertising',
      amount: dailyAdSpend,
      currency: 'USD',
      incurredAt: expenseDate,
      description: `Seed: Amazon PPC - Day ${daysAgo}`,
    })
  }

  await prisma.expense.createMany({
    data: [
      ...adExpenses,
      {
        accountId: demoAccount.id,
        marketplaceId: amazonUs.id,
        type: 'fixed',
        category: 'Software',
        amount: 49.0,
        currency: 'USD',
        description: 'Seed: SaaS subscription',
      },
      {
        accountId: demoAccount.id,
        marketplaceId: amazonUs.id,
        type: 'one-time',
        category: 'Logistics',
        amount: 120.0,
        currency: 'USD',
        description: 'Seed: Inbound shipping',
      },
    ],
  })

  await prisma.cOGS.deleteMany({
    where: {
      accountId: demoAccount.id,
      sku: { in: products.map((product) => product.sku) },
    },
  })

  await prisma.cOGS.createMany({
    data: [
      {
        accountId: demoAccount.id,
        marketplaceId: amazonUs.id,
        sku: products[0].sku,
        quantity: 2,
        unitCost: 32.5,
        totalCost: 65.0,
        costMethod: 'WEIGHTED_AVERAGE',
        shipmentCost: 5.0,
      },
      {
        accountId: demoAccount.id,
        marketplaceId: amazonUs.id,
        sku: products[1].sku,
        quantity: 4,
        unitCost: 10.5,
        totalCost: 42.0,
        costMethod: 'WEIGHTED_AVERAGE',
        shipmentCost: 3.0,
      },
      {
        accountId: demoAccount.id,
        marketplaceId: amazonUs.id,
        sku: products[2].sku,
        quantity: 2,
        unitCost: 18.25,
        totalCost: 36.5,
        costMethod: 'WEIGHTED_AVERAGE',
        shipmentCost: 2.5,
      },
      // COGS for Canadian products
      {
        accountId: demoAccount.id,
        marketplaceId: amazonCa.id,
        sku: 'B0F4RTTQXQ',
        quantity: 50,
        unitCost: 4.52,
        totalCost: 226.0,
        costMethod: 'WEIGHTED_AVERAGE',
        shipmentCost: 10.0,
      },
      {
        accountId: demoAccount.id,
        marketplaceId: amazonCa.id,
        sku: 'B0FNBXLBWJ',
        quantity: 40,
        unitCost: 6.90,
        totalCost: 276.0,
        costMethod: 'WEIGHTED_AVERAGE',
        shipmentCost: 8.0,
      },
      {
        accountId: demoAccount.id,
        marketplaceId: amazonCa.id,
        sku: 'B0DG63T1DL',
        quantity: 30,
        unitCost: 6.90,
        totalCost: 207.0,
        costMethod: 'WEIGHTED_AVERAGE',
        shipmentCost: 12.0,
      },
    ],
  })

  // Seed purchase order for pending shipments (skip if schema not migrated)
  try {
    const supplier = await prisma.supplier.findFirst({ where: { name: 'Demo Supplier' } })
    const demoSupplier =
      supplier ||
      (await prisma.supplier.create({
        data: {
          name: 'Demo Supplier',
          email: 'supplier@demo.com',
          phone: '+1-555-0100',
        },
      }))

    const po = await prisma.purchaseOrder.upsert({
      where: { poNumber: 'PO-DEMO-1001' },
      update: {
        status: 'pending',
      },
      create: {
        supplierId: demoSupplier.id,
        accountId: demoAccount.id,
        marketplaceId: amazonUs.id,
        poNumber: 'PO-DEMO-1001',
        status: 'pending',
        totalQuantity: 150,
        totalCost: 2450.0,
        estimatedDeliveryDate: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
      },
    })

    await prisma.purchaseOrderItem.deleteMany({
      where: { purchaseOrderId: po.id },
    })

    await prisma.purchaseOrderItem.createMany({
      data: [
        {
          purchaseOrderId: po.id,
          productId: products[0].id,
          sku: products[0].sku,
          quantity: 50,
          unitCost: 30.0,
          totalCost: 1500.0,
        },
        {
          purchaseOrderId: po.id,
          productId: products[1].id,
          sku: products[1].sku,
          quantity: 100,
          unitCost: 9.5,
          totalCost: 950.0,
        },
      ],
    })

    await prisma.inboundShipment.deleteMany({
      where: { purchaseOrderId: po.id },
    })

    await prisma.inboundShipment.createMany({
      data: [
        {
          purchaseOrderId: po.id,
          sku: products[0].sku,
          quantityShipped: 50,
          quantityReceived: 0,
          shipmentDate: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
          status: 'in-transit',
        },
        {
          purchaseOrderId: po.id,
          sku: products[1].sku,
          quantityShipped: 100,
          quantityReceived: 20,
          shipmentDate: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
          status: 'in-transit',
        },
      ],
    })
  } catch (error: any) {
    if (error?.code === 'P2022') {
      console.warn(
        '⚠️ Skipping purchase order seeding because the database schema is missing Supplier fields. Run migrations to enable this seed.'
      )
    } else {
      throw error
    }
  }

  // Seed PPC metrics for dashboard/metrics views
  await prisma.pPCMetric.deleteMany({
    where: { amazonAccountId: demoAmazonAccount.id },
  })

  const ppcDates = [2, 6, 12, 18, 24].map((days) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000))
  const ppcMetricsSeed = [
    { campaignId: 'Camp-A', adGroupId: 'AdGroup-A1', keywordId: 'keyword-a', spend: 42.5, sales: 210.0 },
    { campaignId: 'Camp-A', adGroupId: 'AdGroup-A2', keywordId: 'keyword-b', spend: 31.2, sales: 145.5 },
    { campaignId: 'Camp-B', adGroupId: 'AdGroup-B1', keywordId: 'keyword-c', spend: 58.0, sales: 260.2 },
    { campaignId: 'Camp-C', adGroupId: 'AdGroup-C1', keywordId: 'keyword-d', spend: 18.5, sales: 90.3 },
  ]

  for (const date of ppcDates) {
    await prisma.pPCMetric.createMany({
      data: ppcMetricsSeed.map((item) => ({
        campaignId: item.campaignId,
        adGroupId: item.adGroupId,
        keywordId: item.keywordId,
        clicks: Math.floor(item.spend * 3),
        spend: item.spend,
        sales: item.sales,
        acos: item.sales > 0 ? (item.spend / item.sales) * 100 : 0,
        amazonAccountId: demoAmazonAccount.id,
        marketplaceId: amazonUs.id,
        date,
      })),
    })
  }

  await prisma.pPCCampaign.deleteMany({ where: { accountId: demoAccount.id } })
  await prisma.pPCAdGroup.deleteMany({ where: { accountId: demoAccount.id } })
  await prisma.pPCKeyword.deleteMany({ where: { accountId: demoAccount.id } })

  await prisma.pPCCampaign.createMany({
    data: [
      {
        accountId: demoAccount.id,
        marketplaceId: amazonUs.id,
        campaignName: 'Camp-A',
        status: 'active',
        totalSpend: 180.0,
        totalSales: 800.0,
        acos: 22.5,
        roi: 344.0,
      },
      {
        accountId: demoAccount.id,
        marketplaceId: amazonUs.id,
        campaignName: 'Camp-B',
        status: 'active',
        totalSpend: 120.0,
        totalSales: 420.0,
        acos: 28.6,
        roi: 250.0,
      },
    ],
  })

  const campaigns = await prisma.pPCCampaign.findMany({
    where: { accountId: demoAccount.id },
  })

  const campA = campaigns.find((c) => c.campaignName === 'Camp-A')
  const campB = campaigns.find((c) => c.campaignName === 'Camp-B')

  if (campA && campB) {
    await prisma.pPCAdGroup.createMany({
      data: [
        {
          campaignId: campA.id,
          accountId: demoAccount.id,
          marketplaceId: amazonUs.id,
          adGroupName: 'AdGroup-A1',
          spend: 90.0,
          sales: 420.0,
          acos: 21.4,
          roi: 366.0,
        },
        {
          campaignId: campB.id,
          accountId: demoAccount.id,
          marketplaceId: amazonUs.id,
          adGroupName: 'AdGroup-B1',
          spend: 65.0,
          sales: 210.0,
          acos: 31.0,
          roi: 223.0,
        },
      ],
    })

    const adGroups = await prisma.pPCAdGroup.findMany({ where: { accountId: demoAccount.id } })
    await prisma.pPCKeyword.createMany({
      data: adGroups.map((group) => ({
        adGroupId: group.id,
        accountId: demoAccount.id,
        marketplaceId: amazonUs.id,
        keyword: `${group.adGroupName}-kw`,
        matchType: 'phrase',
        spend: group.spend / 2,
        sales: group.sales / 2,
        acos: group.acos,
        roi: group.roi,
      })),
    })
  }

  // Seed inventory forecasts & KPIs
  await prisma.inventoryForecast.deleteMany({ where: { accountId: demoAccount.id } })
  await prisma.inventoryKPI.deleteMany({ where: { accountId: demoAccount.id } })
  await prisma.batch.deleteMany({ where: { accountId: demoAccount.id } })

  // Create Batch records for FIFO assignments
  const batchSeeds = [
    { sku: 'SKU-1001', quantity: 50, unitCost: 32.5, receivedDaysAgo: 15 },
    { sku: 'SKU-1001', quantity: 70, unitCost: 31.8, receivedDaysAgo: 5 },
    { sku: 'SKU-1002', quantity: 30, unitCost: 10.5, receivedDaysAgo: 20 },
    { sku: 'SKU-1002', quantity: 20, unitCost: 10.2, receivedDaysAgo: 8 },
    { sku: 'SKU-1003', quantity: 25, unitCost: 18.25, receivedDaysAgo: 12 },
    { sku: 'SKU-2001', quantity: 40, unitCost: 35.0, receivedDaysAgo: 10 },
    { sku: 'SKU-2001', quantity: 22, unitCost: 34.5, receivedDaysAgo: 3 },
    { sku: 'SKU-2002', quantity: 15, unitCost: 20.0, receivedDaysAgo: 7 },
    { sku: 'SKU-3001', quantity: 100, unitCost: 25.0, receivedDaysAgo: 25 },
    { sku: 'SKU-3001', quantity: 110, unitCost: 24.5, receivedDaysAgo: 2 },
  ]

  const batches = []
  for (const seed of batchSeeds) {
    const batch = await prisma.batch.create({
      data: {
        accountId: demoAccount.id,
        sku: seed.sku,
        quantity: seed.quantity,
        unitCost: seed.unitCost,
        totalCost: seed.quantity * seed.unitCost,
        receivedAt: new Date(now.getTime() - seed.receivedDaysAgo * 24 * 60 * 60 * 1000),
        notes: `Seed batch for ${seed.sku}`,
      },
    })
    batches.push(batch)
  }

  const forecastSeed = inventorySeed.map((item) => {
    const salesVelocity = item.quantityAvailable > 0 ? 3.2 : 0
    const forecast3Day = Math.max(0, item.quantityAvailable - salesVelocity * 3)
    const forecast7Day = Math.max(0, item.quantityAvailable - salesVelocity * 7)
    const forecast30Day = Math.max(0, item.quantityAvailable - salesVelocity * 30)
    
    return {
      sku: item.sku,
      marketplaceId: item.marketplaceId,
      currentStock: item.quantityAvailable,
      salesVelocity,
      forecast3Day,
      forecast7Day,
      forecast30Day,
      restockThreshold: item.lowStockThreshold,
    }
  })

  await prisma.inventoryForecast.createMany({
    data: forecastSeed.map((item) => ({
      accountId: demoAccount.id,
      marketplaceId: item.marketplaceId,
      sku: item.sku,
      currentStock: item.currentStock,
      salesVelocity: item.salesVelocity,
      forecast3Day: item.forecast3Day,
      forecast7Day: item.forecast7Day,
      forecast30Day: item.forecast30Day,
      restockThreshold: item.restockThreshold,
      alertSent: false,
      lastCalculatedAt: new Date(),
    })),
  })

  // Build FIFO batch assignments from actual Batch records
  const kpiData = forecastSeed.map((item) => {
    const skuBatches = batches
      .filter((b) => b.sku === item.sku)
      .sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime())
    
    let remaining = item.currentStock
    const fifoAssignments = []
    for (const batch of skuBatches) {
      if (remaining <= 0) break
      const assigned = Math.min(batch.quantity, remaining)
      fifoAssignments.push({
        batchId: batch.id,
        receivedAt: batch.receivedAt.toISOString(),
        quantityAssigned: assigned,
      })
      remaining -= assigned
    }

    const daysOfStockLeft = item.salesVelocity > 0 ? item.currentStock / item.salesVelocity : (item.currentStock > 0 ? 999 : 0)
    const overstockRisk = item.currentStock > 200 || daysOfStockLeft > 90

    return {
      accountId: demoAccount.id,
      marketplaceId: item.marketplaceId,
      sku: item.sku,
      daysOfStockLeft,
      overstockRisk,
      fifoBatchAssignments: fifoAssignments.length > 0 ? fifoAssignments : null,
      lastCalculatedAt: new Date(),
    }
  })

  await prisma.inventoryKPI.createMany({
    data: kpiData,
  })

  // Seed alerts for dashboard
  await prisma.alert.deleteMany({
    where: {
      accountId: demoAccount.id,
      type: { startsWith: 'seed.' },
    },
  })

  // Create KPI alerts based on the KPI data
  const kpiAlerts = kpiData
    .filter((kpi) => {
      // Alert for overstock risk
      if (kpi.overstockRisk) return true
      // Alert for low stock (days of stock left <= 7)
      if (kpi.daysOfStockLeft > 0 && kpi.daysOfStockLeft <= 7) return true
      return false
    })
    .map((kpi) => {
      if (kpi.overstockRisk) {
        return {
          accountId: demoAccount.id,
          type: 'seed.kpi.overstock',
          severity: 'warning' as const,
          title: 'Overstock Risk Alert',
          message: `${kpi.sku} has ${kpi.daysOfStockLeft.toFixed(1)} days of stock remaining, indicating potential overstock risk.`,
          metadata: { sku: kpi.sku, daysOfStockLeft: kpi.daysOfStockLeft, marketplaceId: kpi.marketplaceId },
        }
      } else {
        return {
          accountId: demoAccount.id,
          type: 'seed.kpi.low_stock',
          severity: 'warning' as const,
          title: 'Low Stock KPI Alert',
          message: `${kpi.sku} has only ${kpi.daysOfStockLeft.toFixed(1)} days of stock remaining.`,
          metadata: { sku: kpi.sku, daysOfStockLeft: kpi.daysOfStockLeft, marketplaceId: kpi.marketplaceId },
        }
      }
    })

  await prisma.alert.createMany({
    data: [
      {
        accountId: demoAccount.id,
        type: 'seed.inventory.low',
        severity: 'warning',
        title: 'Low stock alert',
        message: 'SKU-1002 is below threshold.',
        metadata: { sku: 'SKU-1002' },
      },
      {
        accountId: demoAccount.id,
        type: 'seed.po.delay',
        severity: 'warning',
        title: 'Delayed PO',
        message: 'PO-DEMO-1001 is delayed.',
        metadata: { poNumber: 'PO-DEMO-1001' },
      },
      ...kpiAlerts,
    ],
  })

  // Seed report schedule
  await prisma.reportSchedule.deleteMany({
    where: { accountId: demoAccount.id, reportType: 'Profit' },
  })
  await prisma.reportSchedule.create({
    data: {
      accountId: demoAccount.id,
      userId: demoUser.id,
      reportType: 'Profit',
      filters: { period: 'last-7-days' },
      schedule: 'weekly',
      emailRecipients: [demoEmail],
      nextRunAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
    },
  })

  // Seed automated email templates + queue
  await prisma.emailTemplate.deleteMany({
    where: { userId: demoUser.id },
  })

  const requestReviewTemplate = await prisma.emailTemplate.create({
    data: {
      userId: demoUser.id,
      name: 'Request a Review (Amazon compliant)',
      subject: 'How was your order {{orderId}}?',
      body:
        'Hello {{customerName}},<br/><br/>Thank you for your purchase. We hope everything arrived as expected. If you have a moment, please leave a review on Amazon for order {{orderId}}. Your feedback helps other customers.<br/><br/>Thanks,<br/>The Demo Store Team',
      variables: {
        allowed: ['customerName', 'orderId', 'productTitle', 'sku'],
        automation: { delayDays: 5 },
      },
      marketplaceId: amazonUs.id,
      productId: products[0]?.id || null,
      sku: products[0]?.sku || null,
      purchaseType: 'first-time',
    },
  })

  const followUpTemplate = await prisma.emailTemplate.create({
    data: {
      userId: demoUser.id,
      name: 'Delivery Follow-up',
      subject: 'Quick check-in on {{productTitle}}',
      body:
        'Hi {{customerName}},<br/><br/>We wanted to check in to make sure your order {{orderId}} arrived safely. If you need any help, reply to this email.<br/><br/>Thank you,<br/>The Demo Store Team',
      variables: {
        allowed: ['customerName', 'orderId', 'productTitle', 'sku'],
        automation: { delayDays: 2 },
      },
      marketplaceId: amazonUs.id,
      productId: products[1]?.id || null,
      sku: products[1]?.sku || null,
      purchaseType: 'repeat',
    },
  })

  await prisma.emailQueue.deleteMany({
    where: {
      templateId: { in: [requestReviewTemplate.id, followUpTemplate.id] },
    },
  })

  await prisma.emailQueue.createMany({
    data: [
      {
        templateId: requestReviewTemplate.id,
        recipientEmail: 'buyer-one@demo.com',
        scheduledAt: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000),
        status: 'pending',
        eventKey: 'ORDER-1001',
        payload: {
          templateSnapshot: {
            subject: requestReviewTemplate.subject,
            body: requestReviewTemplate.body,
          },
          variables: {
            customerName: 'Alex',
            orderId: 'ORDER-1001',
            productTitle: products[0]?.title || 'Product',
            sku: products[0]?.sku || '',
          },
        },
      },
      {
        templateId: followUpTemplate.id,
        recipientEmail: 'buyer-two@demo.com',
        scheduledAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
        sentAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
        status: 'sent',
        openedCount: 1,
        clickedCount: 0,
        responseCount: 0,
        eventKey: 'ORDER-1002',
        payload: {
          templateSnapshot: {
            subject: followUpTemplate.subject,
            body: followUpTemplate.body,
          },
          variables: {
            customerName: 'Jamie',
            orderId: 'ORDER-1002',
            productTitle: products[1]?.title || 'Product',
            sku: products[1]?.sku || '',
          },
        },
      },
      {
        templateId: requestReviewTemplate.id,
        recipientEmail: 'buyer-three@demo.com',
        scheduledAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
        sentAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
        status: 'sent',
        openedCount: 1,
        clickedCount: 1,
        responseCount: 0,
        eventKey: 'ORDER-1003',
        payload: {
          templateSnapshot: {
            subject: requestReviewTemplate.subject,
            body: requestReviewTemplate.body,
          },
          variables: {
            customerName: 'Taylor',
            orderId: 'ORDER-1003',
            productTitle: products[0]?.title || 'Product',
            sku: products[0]?.sku || '',
          },
        },
      },
    ],
  })

  console.log('✅ Demo account, user, inventory, and email automation seeded')
  console.log(`✅ Canadian orders seeded: ${canadianOrders.length} orders with ${canadianOrderItems.length} order items`)

  console.log('🎉 Seeding completed!')
  console.log('\n📋 Summary:')
  console.log(`  - Roles: ADMIN, MANAGER, VIEWER`)
  console.log(`  - Permissions: ${createdPermissions.length} permissions created`)
  console.log(`  - Marketplaces: Amazon, Amazon US, Amazon UK, Amazon.ca`)
  console.log(`  - Demo user: ${demoEmail} (password: Demo123!)`)
  console.log(`  - Canadian orders: ${canadianOrders.length} orders with ${canadianOrderItems.length} order items`)
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
