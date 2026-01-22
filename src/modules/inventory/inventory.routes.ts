import { Router } from 'express'
import * as inventoryController from './inventory.controller'
import { authenticate } from '../../middlewares/auth.middleware'
import stockRoutes from './stock/stock.routes'
import forecastRoutes from './forecast/forecast.routes'
import kpisRoutes from './kpis/kpis.routes'

const router = Router()
router.use(authenticate)

router.get('/products', inventoryController.getProducts)
router.get('/products/low-stock', inventoryController.getLowStockProducts)
router.get('/products/:id', inventoryController.getProductById)
router.patch('/products/:id', inventoryController.updateProduct)

// Stock level routes
router.use('/', stockRoutes)

// Forecast routes
router.use('/forecast', forecastRoutes)

// KPI routes
router.use('/kpis', kpisRoutes)

export default router

