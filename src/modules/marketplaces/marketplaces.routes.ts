import { Router } from 'express'
import * as marketplacesController from './marketplaces.controller'

/**
 * Marketplaces routes
 * Public routes - no authentication required
 */

const router = Router()

router.get('/', marketplacesController.getMarketplaces)
router.get('/:id', marketplacesController.getMarketplaceById)

export default router

