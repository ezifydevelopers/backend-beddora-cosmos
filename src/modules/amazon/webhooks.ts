import { Request, Response, NextFunction } from 'express'
import { logger } from '../../config/logger'
import { AppError } from '../../middlewares/error.middleware'
import { verifyWebhookSignature, sanitizeSensitiveData } from '../../utils/security.utils'
import { getClientIP } from '../../utils/security.utils'
import prisma from '../../config/db'
import { getQueue, QueueName, DataSyncJobData } from '../../config/queue'
import { createAuditLog } from '../../utils/audit.service'
import { isRedisConnected } from '../../config/redis'

/**
 * Amazon SP-API Webhook Handlers
 * 
 * Handles webhooks from Amazon with signature verification.
 * 
 * Security:
 * - Verifies webhook signatures to ensure authenticity
 * - Sanitizes sensitive data before logging
 * - Validates request structure
 * 
 * Architecture:
 * - Modular webhook handlers
 * - Can be extracted to separate microservice
 */

/**
 * Get webhook secret from environment or database
 * 
 * In production, store webhook secrets per seller in database.
 * For now, uses environment variable.
 */
function getWebhookSecret(sellerId?: string): string {
  // TODO: In production, fetch from database per seller
  const secret = process.env.AMAZON_WEBHOOK_SECRET || process.env.AMAZON_SP_API_CLIENT_SECRET || ''
  
  if (!secret) {
    logger.warn('Webhook secret not configured - webhook verification will fail', {
      sellerId,
    })
  }

  return secret
}

/**
 * Verify webhook signature middleware
 * 
 * Validates that the webhook request is from Amazon.
 * Must be called before processing webhook payload.
 */
export function verifyWebhookSignatureMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const signature = req.headers['x-amzn-signature'] as string
    const sellerId = (req.body?.sellerId || req.query?.sellerId) as string | undefined

    if (!signature) {
      logger.warn('Webhook request missing signature', {
        ip: getClientIP(req),
        path: req.path,
      })
      throw new AppError('Missing webhook signature', 401)
    }

    // Get raw body (Express body-parser may have parsed it)
    // For signature verification, we need the raw body
    const rawBody = (req as any).rawBody || JSON.stringify(req.body)
    const secret = getWebhookSecret(sellerId)

    if (!secret) {
      logger.error('Webhook secret not configured', {
        sellerId,
        path: req.path,
      })
      throw new AppError('Webhook secret not configured', 500)
    }

    const isValid = verifyWebhookSignature(rawBody, signature, secret)

    if (!isValid) {
      logger.warn('Invalid webhook signature', {
        ip: getClientIP(req),
        path: req.path,
        sellerId,
      })
      throw new AppError('Invalid webhook signature', 401)
    }

    logger.debug('Webhook signature verified', {
      path: req.path,
      sellerId,
    })

    next()
  } catch (error) {
    next(error)
  }
}

/**
 * Handle Amazon order notification webhook
 * 
 * POST /api/amazon/webhooks/orders
 * 
 * Requires:
 * - X-Amzn-Signature header for verification
 * - Valid webhook payload
 */
export async function handleOrderNotification(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Signature verification is handled by middleware
    const payload = req.body

    // Validate payload structure
    if (!payload || !payload.orderId) {
      throw new AppError('Invalid webhook payload: missing orderId', 400)
    }

    // Parse webhook payload
    const orderId = payload.orderId || payload.OrderId
    const sellerId = payload.sellerId || payload.SellerId
    const marketplaceId = payload.marketplaceId || payload.MarketplaceId
    const orderStatus = payload.orderStatus || payload.OrderStatus
    const eventType = payload.eventType || payload.EventType || 'ORDER_UPDATE'

    if (!orderId) {
      throw new AppError('Invalid webhook payload: missing orderId', 400)
    }

    // Find Amazon account by seller ID
    const account = await prisma.amazonAccount.findFirst({
      where: {
        amazonSellerId: sellerId,
        isActive: true,
      },
      select: {
        id: true,
        userId: true,
        marketplaceIds: true,
      },
    })

    if (!account) {
      logger.warn('Received webhook for unknown seller', {
        sellerId,
        orderId,
      })
      // Still return 200 to prevent Amazon from retrying
      res.status(200).json({ received: true, message: 'Seller not found' })
      return
    }

    // Update order status in database if order exists
    try {
      await prisma.amazonOrder.updateMany({
        where: {
          orderId,
          amazonAccountId: account.id,
        },
        data: {
          status: orderStatus || 'Unknown',
          updatedAt: new Date(),
        },
      })

      logger.info('Updated order from webhook', {
        orderId,
        amazonAccountId: account.id,
        status: orderStatus,
      })
    } catch (error: any) {
      // Order might not exist yet - that's okay, sync will create it
      logger.debug('Order not found in database (will be synced)', {
        orderId,
        amazonAccountId: account.id,
      })
    }

    // Trigger order sync job in background
    try {
      if (isRedisConnected()) {
        const queue = getQueue<DataSyncJobData>(QueueName.DATA_SYNC)
        await queue.add(
          `webhook-sync-order-${orderId}`,
          {
            amazonAccountId: account.id,
            userId: account.userId,
            syncType: 'orders',
            options: {
              // Sync recent orders to catch this one
              startDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
            },
          },
          {
            jobId: `webhook-order-${orderId}-${Date.now()}`,
            priority: 5, // High priority for webhook-triggered syncs
            removeOnComplete: true, // Don't keep completed webhook syncs
          }
        )

        logger.debug('Queued order sync job from webhook', {
          orderId,
          amazonAccountId: account.id,
        })
      }
    } catch (error: any) {
      logger.warn('Failed to queue order sync job', {
        orderId,
        error: error.message,
      })
      // Don't fail the webhook if queue is unavailable
    }

    // Audit log
    await createAuditLog(account.userId, 'WEBHOOK_ORDER_RECEIVED', 'AmazonOrder', account.id, {
      orderId,
      eventType,
      status: orderStatus,
    })

    logger.info('Received Amazon order notification webhook', {
      orderId,
      sellerId,
      amazonAccountId: account.id,
      eventType,
      // Never log full payload (may contain sensitive data)
    })

    res.status(200).json({ received: true, orderId })
  } catch (error) {
    logger.error('Failed to handle order notification webhook', {
      error: (error as Error).message,
      // Sanitize error to prevent sensitive data exposure
      payload: sanitizeSensitiveData(req.body),
    })
    next(error)
  }
}

/**
 * Handle Amazon inventory notification webhook
 * 
 * POST /api/amazon/webhooks/inventory
 * 
 * Requires:
 * - X-Amzn-Signature header for verification
 * - Valid webhook payload
 */
export async function handleInventoryNotification(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Signature verification is handled by middleware
    const payload = req.body

    // Validate payload structure
    if (!payload) {
      throw new AppError('Invalid webhook payload', 400)
    }

    // Parse webhook payload
    const sellerId = payload.sellerId || payload.SellerId
    const marketplaceId = payload.marketplaceId || payload.MarketplaceId
    const eventType = payload.eventType || payload.EventType || 'INVENTORY_UPDATE'
    const inventoryItems = payload.inventoryItems || payload.InventoryItems || []

    if (!sellerId) {
      throw new AppError('Invalid webhook payload: missing sellerId', 400)
    }

    // Find Amazon account by seller ID
    const account = await prisma.amazonAccount.findFirst({
      where: {
        amazonSellerId: sellerId,
        isActive: true,
      },
      select: {
        id: true,
        userId: true,
        marketplaceIds: true,
      },
    })

    if (!account) {
      logger.warn('Received webhook for unknown seller', {
        sellerId,
      })
      // Still return 200 to prevent Amazon from retrying
      res.status(200).json({ received: true, message: 'Seller not found' })
      return
    }

    // Update inventory levels if provided in webhook
    if (Array.isArray(inventoryItems) && inventoryItems.length > 0) {
      const updatePromises = inventoryItems.map(async (item: any) => {
        const sku = item.sellerSku || item.SellerSKU || item.sku
        const fulfillableQuantity = item.fulfillableQuantity || item.FulfillableQuantity || 0
        const inboundQuantity = item.inboundQuantity || item.InboundQuantity || 0

        if (!sku) return

        try {
          await prisma.amazonInventory.upsert({
            where: {
              amazonAccountId_sku_marketplaceId: {
                amazonAccountId: account.id,
                sku,
                marketplaceId: marketplaceId || account.marketplaceIds[0] || 'ATVPDKIKX0DER',
              },
            },
            update: {
              stockLevel: fulfillableQuantity,
              inboundQty: inboundQuantity,
              updatedAt: new Date(),
            },
            create: {
              sku,
              marketplaceId: marketplaceId || account.marketplaceIds[0] || 'ATVPDKIKX0DER',
              amazonAccountId: account.id,
              stockLevel: fulfillableQuantity,
              inboundQty: inboundQuantity,
            },
          })
        } catch (error: any) {
          logger.error('Failed to update inventory from webhook', {
            sku,
            error: error.message,
          })
        }
      })

      await Promise.all(updatePromises)

      logger.info('Updated inventory from webhook', {
        amazonAccountId: account.id,
        itemCount: inventoryItems.length,
      })
    }

    // Trigger inventory sync job in background for full sync
    try {
      if (isRedisConnected()) {
        const queue = getQueue<DataSyncJobData>(QueueName.DATA_SYNC)
        await queue.add(
          `webhook-sync-inventory-${account.id}`,
          {
            amazonAccountId: account.id,
            userId: account.userId,
            syncType: 'inventory',
          },
          {
            jobId: `webhook-inventory-${account.id}-${Date.now()}`,
            priority: 5, // High priority for webhook-triggered syncs
            removeOnComplete: true,
          }
        )

        logger.debug('Queued inventory sync job from webhook', {
          amazonAccountId: account.id,
        })
      }
    } catch (error: any) {
      logger.warn('Failed to queue inventory sync job', {
        amazonAccountId: account.id,
        error: error.message,
      })
      // Don't fail the webhook if queue is unavailable
    }

    // Audit log
    await createAuditLog(account.userId, 'WEBHOOK_INVENTORY_RECEIVED', 'AmazonInventory', account.id, {
      eventType,
      itemCount: inventoryItems.length,
    })

    logger.info('Received Amazon inventory notification webhook', {
      sellerId,
      amazonAccountId: account.id,
      eventType,
      itemCount: inventoryItems.length,
      // Never log full payload (may contain sensitive data)
    })

    res.status(200).json({ received: true })
  } catch (error) {
    logger.error('Failed to handle inventory notification webhook', {
      error: (error as Error).message,
      // Sanitize error to prevent sensitive data exposure
      payload: sanitizeSensitiveData(req.body),
    })
    next(error)
  }
}

/**
 * Handle Amazon listing notification webhook
 * 
 * POST /api/amazon/webhooks/listings
 * 
 * Handles notifications about listing changes:
 * - Price changes
 * - Buy Box status changes
 * - Title/description changes
 * - New sellers detected
 * 
 * Requires:
 * - X-Amzn-Signature header for verification
 * - Valid webhook payload
 */
export async function handleListingNotification(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Signature verification is handled by middleware
    const payload = req.body

    // Validate payload structure
    if (!payload) {
      throw new AppError('Invalid webhook payload', 400)
    }

    // Parse webhook payload
    const sellerId = payload.sellerId || payload.SellerId
    const marketplaceId = payload.marketplaceId || payload.MarketplaceId
    const eventType = payload.eventType || payload.EventType || 'LISTING_UPDATE'
    const listingChanges = payload.listingChanges || payload.ListingChanges || []
    const sku = payload.sku || payload.SKU || payload.sellerSku || payload.SellerSKU
    const asin = payload.asin || payload.ASIN

    if (!sellerId) {
      throw new AppError('Invalid webhook payload: missing sellerId', 400)
    }

    // Find Amazon account by seller ID
    const account = await prisma.amazonAccount.findFirst({
      where: {
        amazonSellerId: sellerId,
        isActive: true,
      },
      select: {
        id: true,
        userId: true,
        marketplaceIds: true,
      },
    })

    if (!account) {
      logger.warn('Received webhook for unknown seller', {
        sellerId,
        eventType,
      })
      // Still return 200 to prevent Amazon from retrying
      res.status(200).json({ received: true, message: 'Seller not found' })
      return
    }

    // Process listing changes if provided
    if (Array.isArray(listingChanges) && listingChanges.length > 0) {
      const { transformListingChanges } = await import('./transformers')
      const defaultMarketplaceId = marketplaceId || account.marketplaceIds[0] || 'ATVPDKIKX0DER'
      const transformedChanges = transformListingChanges(listingChanges, defaultMarketplaceId)

      const changePromises = transformedChanges.map(async (transformedChange) => {
        if (!transformedChange.sku) {
          logger.warn('Listing change missing SKU', { transformedChange })
          return
        }

        try {
          // Store listing change in database
          await prisma.listingChange.create({
            data: {
              sku: transformedChange.sku,
              marketplaceId: transformedChange.marketplaceId,
              amazonAccountId: account.id,
              changes: {
                eventType: transformedChange.eventType,
                asin: transformedChange.asin,
                previousPrice: transformedChange.previousPrice,
                newPrice: transformedChange.newPrice,
                previousTitle: transformedChange.previousTitle,
                newTitle: transformedChange.newTitle,
                buyBoxLost: transformedChange.buyBoxLost,
                buyBoxWon: transformedChange.buyBoxWon,
                newSellerDetected: transformedChange.newSellerDetected,
                competitorCount: transformedChange.competitorCount,
              },
            },
          })

          logger.debug('Stored listing change from webhook', {
            sku: changeSku,
            amazonAccountId: account.id,
            eventType,
          })
        } catch (error: any) {
          logger.error('Failed to store listing change from webhook', {
            sku: changeSku,
            error: error.message,
          })
        }
      })

      await Promise.all(changePromises)

      logger.info('Processed listing changes from webhook', {
        amazonAccountId: account.id,
        changeCount: listingChanges.length,
      })
    } else if (sku) {
      // Single listing change (not in array format)
      try {
        const changeMarketplaceId = marketplaceId || account.marketplaceIds[0] || 'ATVPDKIKX0DER'
        
        await prisma.listingChange.create({
          data: {
            sku,
            marketplaceId: changeMarketplaceId,
            amazonAccountId: account.id,
            changes: {
              eventType,
              asin,
              previousPrice: payload.previousPrice || payload.PreviousPrice,
              newPrice: payload.newPrice || payload.NewPrice,
              previousTitle: payload.previousTitle || payload.PreviousTitle,
              newTitle: payload.newTitle || payload.NewTitle,
              buyBoxLost: payload.buyBoxLost || payload.BuyBoxLost || false,
              buyBoxWon: payload.buyBoxWon || payload.BuyBoxWon || false,
              newSellerDetected: payload.newSellerDetected || payload.NewSellerDetected || false,
              ...payload, // Include any additional payload data
            },
          },
        })

        logger.info('Stored listing change from webhook', {
          sku,
          amazonAccountId: account.id,
          eventType,
        })
      } catch (error: any) {
        logger.error('Failed to store listing change from webhook', {
          sku,
          error: error.message,
        })
      }
    }

    // Trigger listings sync job in background for full sync
    try {
      if (isRedisConnected()) {
        const queue = getQueue<DataSyncJobData>(QueueName.DATA_SYNC)
        await queue.add(
          `webhook-sync-listings-${account.id}`,
          {
            amazonAccountId: account.id,
            userId: account.userId,
            syncType: 'listings',
          },
          {
            jobId: `webhook-listings-${account.id}-${Date.now()}`,
            priority: 5, // High priority for webhook-triggered syncs
            removeOnComplete: true,
          }
        )

        logger.debug('Queued listings sync job from webhook', {
          amazonAccountId: account.id,
        })
      }
    } catch (error: any) {
      logger.warn('Failed to queue listings sync job', {
        amazonAccountId: account.id,
        error: error.message,
      })
      // Don't fail the webhook if queue is unavailable
    }

    // Audit log
    await createAuditLog(account.userId, 'WEBHOOK_LISTING_RECEIVED', 'ListingChange', account.id, {
      eventType,
      changeCount: Array.isArray(listingChanges) ? listingChanges.length : (sku ? 1 : 0),
    })

    logger.info('Received Amazon listing notification webhook', {
      sellerId,
      amazonAccountId: account.id,
      eventType,
      changeCount: Array.isArray(listingChanges) ? listingChanges.length : (sku ? 1 : 0),
      // Never log full payload (may contain sensitive data)
    })

    res.status(200).json({ received: true })
  } catch (error) {
    logger.error('Failed to handle listing notification webhook', {
      error: (error as Error).message,
      // Sanitize error to prevent sensitive data exposure
      payload: sanitizeSensitiveData(req.body),
    })
    next(error)
  }
}

/**
 * Handle Amazon token rotation notification webhook
 * 
 * POST /api/amazon/webhooks/token-rotation
 * 
 * Handles notifications when Amazon rotates the refresh token.
 * This is a proactive notification from Amazon that a new refresh token
 * should be used. The old token will stop working after a grace period.
 * 
 * Requires:
 * - X-Amzn-Signature header for verification
 * - Valid webhook payload with new refresh token
 */
export async function handleTokenRotationNotification(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Signature verification is handled by middleware
    const payload = req.body

    // Validate payload structure
    if (!payload) {
      throw new AppError('Invalid webhook payload', 400)
    }

    // Parse webhook payload
    const sellerId = payload.sellerId || payload.SellerId
    const newRefreshToken = payload.newRefreshToken || payload.NewRefreshToken || payload.refreshToken || payload.RefreshToken
    const oldRefreshToken = payload.oldRefreshToken || payload.OldRefreshToken
    const rotationReason = payload.reason || payload.Reason || payload.rotationReason || 'TOKEN_ROTATION'
    const effectiveDate = payload.effectiveDate || payload.EffectiveDate

    if (!sellerId) {
      throw new AppError('Invalid webhook payload: missing sellerId', 400)
    }

    if (!newRefreshToken) {
      throw new AppError('Invalid webhook payload: missing newRefreshToken', 400)
    }

    // Find Amazon account by seller ID
    const account = await prisma.amazonAccount.findFirst({
      where: {
        amazonSellerId: sellerId,
        isActive: true,
      },
      select: {
        id: true,
        userId: true,
        refreshToken: true,
      },
    })

    if (!account) {
      logger.warn('Received token rotation webhook for unknown seller', {
        sellerId,
      })
      // Still return 200 to prevent Amazon from retrying
      res.status(200).json({ received: true, message: 'Seller not found' })
      return
    }

    // Import encryption function
    const { encrypt, decrypt } = await import('../../utils/encryption')

    // Verify old token matches (if provided)
    if (oldRefreshToken) {
      try {
        const decryptedOldToken = decrypt(account.refreshToken)
        if (decryptedOldToken !== oldRefreshToken) {
          logger.warn('Token rotation webhook: old token mismatch', {
            amazonAccountId: account.id,
            // Don't log tokens
          })
          // Still proceed - might be a race condition or token already rotated
        }
      } catch (error) {
        logger.warn('Failed to decrypt old token for verification', {
          amazonAccountId: account.id,
          error: (error as Error).message,
        })
        // Continue anyway - might be encrypted differently
      }
    }

    // Update refresh token in database
    try {
      await prisma.amazonAccount.update({
        where: { id: account.id },
        data: {
          refreshToken: encrypt(newRefreshToken),
          lastTokenRefreshAt: new Date(),
        } as any,
      })

      logger.info('Updated refresh token from rotation webhook', {
        amazonAccountId: account.id,
        rotationReason,
        effectiveDate,
      })
    } catch (error: any) {
      logger.error('CRITICAL: Failed to update refresh token from webhook', {
        amazonAccountId: account.id,
        error: error.message,
      })
      throw new AppError('Failed to update refresh token', 500)
    }

    // Clear token cache to force refresh on next API call
    try {
      const { clearTokenCache } = await import('./token.service')
      // Clear cache for both old and new tokens
      await clearTokenCache(process.env.AMAZON_SP_API_CLIENT_ID || '', newRefreshToken)
      if (oldRefreshToken) {
        await clearTokenCache(process.env.AMAZON_SP_API_CLIENT_ID || '', oldRefreshToken)
      }
    } catch (error: any) {
      logger.warn('Failed to clear token cache after rotation', {
        amazonAccountId: account.id,
        error: error.message,
      })
      // Non-critical - cache will expire naturally
    }

    // Audit log
    await createAuditLog(account.userId, 'WEBHOOK_TOKEN_ROTATION', 'AmazonAccount', account.id, {
      rotationReason,
      effectiveDate,
      tokenRotated: true,
    })

    logger.info('Received Amazon token rotation notification webhook', {
      sellerId,
      amazonAccountId: account.id,
      rotationReason,
      effectiveDate,
      // Never log tokens
    })

    res.status(200).json({ received: true, tokenUpdated: true })
  } catch (error) {
    logger.error('Failed to handle token rotation notification webhook', {
      error: (error as Error).message,
      // Sanitize error to prevent sensitive data exposure
      payload: sanitizeSensitiveData(req.body),
    })
    next(error)
  }
}
