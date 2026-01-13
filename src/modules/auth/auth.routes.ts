import { Router } from 'express'
import * as authController from './auth.controller'
import {
  registerValidation,
  loginValidation,
  passwordResetRequestValidation,
  passwordResetValidation,
} from './auth.validation'
import { authenticate } from '../../middlewares/auth.middleware'
import { rateLimitRegister, rateLimitLogin, rateLimitPassword } from '../../middlewares/rateLimiter'

/**
 * Authentication routes
 * Defines all authentication endpoints
 */

const router = Router()

// Public routes with rate limiting
router.post('/register', rateLimitRegister, registerValidation, authController.register)
router.post('/login', rateLimitLogin, loginValidation, authController.login)
router.post('/refresh', authController.refreshToken) // uses HttpOnly cookie; no body required
router.post('/forgot-password', rateLimitPassword, passwordResetRequestValidation, authController.requestPasswordReset)
router.post('/reset-password', rateLimitPassword, passwordResetValidation, authController.resetPassword)
router.get('/verify-email', authController.verifyEmail)

// Protected routes
router.get('/me', authenticate, authController.getCurrentUser)
router.post('/logout', authenticate, authController.logout)

export default router
