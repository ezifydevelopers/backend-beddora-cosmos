import { Router } from 'express'
import * as authController from './auth.controller'
import {
  registerValidation,
  loginValidation,
  refreshTokenValidation,
  passwordResetRequestValidation,
  passwordResetValidation,
} from './auth.validation'
import { authenticate } from '../../middlewares/auth.middleware'

/**
 * Authentication routes
 * Defines all authentication endpoints
 */

const router = Router()

// Public routes
router.post('/register', registerValidation, authController.register)
router.post('/login', loginValidation, authController.login)
router.post('/refresh', refreshTokenValidation, authController.refreshToken)
router.post('/forgot-password', passwordResetRequestValidation, authController.requestPasswordReset)
router.post('/reset-password', passwordResetValidation, authController.resetPassword)
router.get('/verify-email', authController.verifyEmail)

// Protected routes
router.get('/me', authenticate, authController.getCurrentUser)
router.post('/logout', authenticate, authController.logout)

export default router
