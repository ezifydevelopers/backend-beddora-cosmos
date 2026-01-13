import { Router } from 'express'
import * as expensesController from './expenses.controller'
import { authenticate } from '../../middlewares/auth.middleware'

const router = Router()
router.use(authenticate)

router.get('/', expensesController.getExpenses)
router.post('/', expensesController.createExpense)
router.put('/:id', expensesController.updateExpense)
router.delete('/:id', expensesController.deleteExpense)

export default router

