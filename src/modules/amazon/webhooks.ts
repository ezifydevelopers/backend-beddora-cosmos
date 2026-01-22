import { Request, Response, NextFunction } from 'express'
import { logger } from '../../config/logger'
import { AppError } from '../../middlewares/error.middleware'
import { verifyWebhookSignature, sanitizeSensitiveData } from '../../utils/security.utils'
import { getClientIP } from '../../utils/security.utils'

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

    // TODO: Process order notification
    // 1. Parse webhook payload
    // 2. Update order status in database
    // 3. Trigger order sync if needed

    logger.info('Received Amazon order notification webhook', {
      orderId: payload.orderId,
      sellerId: payload.sellerId,
      // Never log full payload (may contain sensitive data)
    })

    res.status(200).json({ received: true, orderId: payload.orderId })
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

    // TODO: Process inventory notification
    // 1. Parse webhook payload
    // 2. Update inventory levels in database
    // 3. Trigger inventory sync if needed

    logger.info('Received Amazon inventory notification webhook', {
      sellerId: payload.sellerId,
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

