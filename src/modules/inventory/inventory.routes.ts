import { Router } from 'express'
import * as inventoryController from './inventory.controller'
import { authenticate } from '../../middlewares/auth.middleware'

const router = Router()
router.use(authenticate)

router.get('/products', inventoryController.getProducts)
router.get('/products/low-stock', inventoryController.getLowStockProducts)
router.get('/products/:id', inventoryController.getProductById)
router.patch('/products/:id', inventoryController.updateProduct)

export default router

