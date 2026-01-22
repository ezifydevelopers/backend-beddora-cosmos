import { Router } from 'express'
import dashboardRoutes from './dashboard/ppc.routes'
import metricsRoutes from './metrics/metrics.routes'
import optimizationRoutes from './optimization/optimization.routes'
import bulkRoutes from './bulk/bulk.routes'
import profitMetricsRoutes from './profit-metrics/profitMetrics.routes'

const router = Router()

router.use('/', dashboardRoutes)
router.use('/metrics', metricsRoutes)
router.use('/optimization', optimizationRoutes)
router.use('/bulk', bulkRoutes)
router.use('/profit', profitMetricsRoutes)

export default router

