import { Router } from 'express'
import { authenticate } from '../../middlewares/auth.middleware'
import * as syncService from './sync.service'
import * as webhookHandlers from './webhooks'

/**
 * Amazon SP API routes
 */

const router = Router()

// Sync routes (protected)
router.post('/sync/orders/:accountId', authenticate, async (req, res, next) => {
  try {
    const { accountId } = req.params
    const result = await syncService.syncOrders(accountId)
    res.status(200).json(result)
  } catch (error) {
    next(error)
  }
})

router.post('/sync/products/:accountId', authenticate, async (req, res, next) => {
  try {
    const { accountId } = req.params
    const result = await syncService.syncProducts(accountId)
    res.status(200).json(result)
  } catch (error) {
    next(error)
  }
})

router.post('/sync/inventory/:accountId', authenticate, async (req, res, next) => {
  try {
    const { accountId } = req.params
    const result = await syncService.syncInventory(accountId)
    res.status(200).json(result)
  } catch (error) {
    next(error)
  }
})

router.post('/sync/ppc/:accountId', authenticate, async (req, res, next) => {
  try {
    const { accountId } = req.params
    const result = await syncService.syncPPCCampaigns(accountId)
    res.status(200).json(result)
  } catch (error) {
    next(error)
  }
})

// Webhook routes (public, but should verify signature)
router.post('/webhooks/orders', webhookHandlers.handleOrderNotification)
router.post('/webhooks/inventory', webhookHandlers.handleInventoryNotification)

export default router

