/**
 * Tracking & Stats Controller
 * 
 * HTTP request/response handling for tracking and statistics endpoints.
 */

import { Response } from 'express'
import { AuthRequest } from '../../../middlewares/auth.middleware'
import * as trackingService from './tracking.service'
import { AppError } from '../../../middlewares/error.middleware'

/**
 * POST /tracking/email/interaction
 * Track an email interaction (open, click, bounce, delivered)
 * This endpoint can be called from webhooks or email service callbacks
 */
export async function trackEmailInteraction(
  req: AuthRequest,
  res: Response
): Promise<void> {
  try {
    const { emailQueueId, eventType, metadata } = req.body

    if (!emailQueueId || !eventType) {
      res.status(400).json({ error: 'emailQueueId and eventType are required' })
      return
    }

    await trackingService.trackEmailInteraction({
      emailQueueId,
      eventType,
      metadata,
    })

    res.status(200).json({ message: 'Interaction tracked successfully' })
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message })
      return
    }
    res.status(500).json({ error: 'Failed to track interaction' })
  }
}

/**
 * GET /tracking/email
 * Get email interaction statistics
 * Query params: accountId, marketplaceId, templateId, productId, sku, startDate, endDate
 */
export async function getEmailStats(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }

    const filters: any = {}
    if (req.query.accountId) filters.accountId = req.query.accountId as string
    if (req.query.marketplaceId) filters.marketplaceId = req.query.marketplaceId as string
    if (req.query.templateId) filters.templateId = req.query.templateId as string
    if (req.query.productId) filters.productId = req.query.productId as string
    if (req.query.sku) filters.sku = req.query.sku as string
    if (req.query.startDate) filters.startDate = new Date(req.query.startDate as string)
    if (req.query.endDate) filters.endDate = new Date(req.query.endDate as string)
    if (req.query.purchaseType) filters.purchaseType = req.query.purchaseType as string

    const stats = await trackingService.getEmailStats(req.userId, filters)
    res.status(200).json({ data: stats })
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message })
      return
    }
    res.status(500).json({ error: 'Failed to fetch email stats' })
  }
}

/**
 * GET /tracking/email/:templateId
 * Get email stats for a specific template
 */
export async function getEmailStatsByTemplate(
  req: AuthRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }

    const { templateId } = req.params
    if (!templateId) {
      res.status(400).json({ error: 'Template ID is required' })
      return
    }

    const filters: any = {}
    if (req.query.accountId) filters.accountId = req.query.accountId as string
    if (req.query.marketplaceId) filters.marketplaceId = req.query.marketplaceId as string
    if (req.query.startDate) filters.startDate = new Date(req.query.startDate as string)
    if (req.query.endDate) filters.endDate = new Date(req.query.endDate as string)

    const stats = await trackingService.getEmailStatsByTemplate(
      req.userId,
      templateId,
      filters
    )
    res.status(200).json({ data: stats })
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message })
      return
    }
    res.status(500).json({ error: 'Failed to fetch email stats' })
  }
}

/**
 * POST /tracking/review
 * Update review statistics when a review is received
 */
export async function updateReviewStats(
  req: AuthRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }

    const {
      templateId,
      accountId,
      marketplaceId,
      productId,
      asin,
      sku,
      reviewReceived,
      isPositive,
      responseTimeHours,
    } = req.body

    if (!templateId) {
      res.status(400).json({ error: 'templateId is required' })
      return
    }

    await trackingService.updateReviewStats({
      templateId,
      userId: req.userId,
      accountId,
      marketplaceId,
      productId,
      asin,
      sku,
      reviewReceived: reviewReceived || false,
      isPositive,
      responseTimeHours,
    })

    res.status(200).json({ message: 'Review stats updated successfully' })
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message })
      return
    }
    res.status(500).json({ error: 'Failed to update review stats' })
  }
}

/**
 * GET /tracking/review
 * Get review generation statistics
 * Query params: accountId, marketplaceId, templateId, productId, asin, sku, startDate, endDate
 */
export async function getReviewStats(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }

    const filters: any = {}
    if (req.query.accountId) filters.accountId = req.query.accountId as string
    if (req.query.marketplaceId) filters.marketplaceId = req.query.marketplaceId as string
    if (req.query.templateId) filters.templateId = req.query.templateId as string
    if (req.query.productId) filters.productId = req.query.productId as string
    if (req.query.asin) filters.asin = req.query.asin as string
    if (req.query.sku) filters.sku = req.query.sku as string
    if (req.query.startDate) filters.startDate = new Date(req.query.startDate as string)
    if (req.query.endDate) filters.endDate = new Date(req.query.endDate as string)

    const stats = await trackingService.getReviewStats(req.userId, filters)
    res.status(200).json({ data: stats })
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message })
      return
    }
    res.status(500).json({ error: 'Failed to fetch review stats' })
  }
}

/**
 * GET /tracking/review/:asin
 * Get review stats for a specific product/ASIN
 */
export async function getReviewStatsByProduct(
  req: AuthRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }

    const { asin } = req.params
    if (!asin) {
      res.status(400).json({ error: 'ASIN is required' })
      return
    }

    const filters: any = {}
    if (req.query.accountId) filters.accountId = req.query.accountId as string
    if (req.query.marketplaceId) filters.marketplaceId = req.query.marketplaceId as string
    if (req.query.templateId) filters.templateId = req.query.templateId as string
    if (req.query.startDate) filters.startDate = new Date(req.query.startDate as string)
    if (req.query.endDate) filters.endDate = new Date(req.query.endDate as string)

    const stats = await trackingService.getReviewStatsByProduct(req.userId, asin, filters)
    res.status(200).json({ data: stats })
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message })
      return
    }
    res.status(500).json({ error: 'Failed to fetch review stats' })
  }
}

