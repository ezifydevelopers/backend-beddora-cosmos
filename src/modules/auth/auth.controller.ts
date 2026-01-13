import { Request, Response, NextFunction } from 'express'
import { validationResult } from 'express-validator'
import { AuthRequest } from '../../middlewares/auth.middleware'
import { AppError } from '../../middlewares/error.middleware'
import * as authService from './auth.service'

/**
 * Authentication controller
 * Handles HTTP requests and responses
 * Delegates business logic to auth.service
 */

/**
 * Register new user
 * POST /api/auth/register
 */
export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() })
      return
    }

    const { email, password, name, acceptTerms, acceptPrivacy } = req.body
    const result = await authService.register({
      email,
      password,
      name,
      acceptTerms: acceptTerms === true || acceptTerms === 'true',
      acceptPrivacy: acceptPrivacy === true || acceptPrivacy === 'true',
    })

    res.status(201).json(result)
  } catch (error) {
    next(error)
  }
}

/**
 * Login user
 * POST /api/auth/login
 */
export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() })
      return
    }

    const { email, password } = req.body
    const result = await authService.login({ email, password })

    res.status(200).json({
      message: 'Login successful',
      ...result,
    })
  } catch (error) {
    next(error)
  }
}

/**
 * Refresh access token
 * POST /api/auth/refresh
 */
export async function refreshToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() })
      return
    }

    const { refreshToken } = req.body
    const result = await authService.refreshToken(refreshToken)

    res.status(200).json(result)
  } catch (error) {
    next(error)
  }
}

/**
 * Logout user
 * POST /api/auth/logout
 */
export async function logout(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      throw new AppError('User not authenticated', 401)
    }

    const { refreshToken } = req.body
    if (!refreshToken) {
      throw new AppError('Refresh token is required', 400)
    }

    const result = await authService.logout(refreshToken, req.userId)

    res.status(200).json(result)
  } catch (error) {
    next(error)
  }
}

/**
 * Request password reset
 * POST /api/auth/forgot-password
 */
export async function requestPasswordReset(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() })
      return
    }

    const { email } = req.body
    const result = await authService.requestPasswordReset(email)

    res.status(200).json(result)
  } catch (error) {
    next(error)
  }
}

/**
 * Reset password
 * POST /api/auth/reset-password
 */
export async function resetPassword(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() })
      return
    }

    const { token, password } = req.body
    const result = await authService.resetPassword(token, password)

    res.status(200).json(result)
  } catch (error) {
    next(error)
  }
}

/**
 * Verify email
 * GET /api/auth/verify-email?token=...
 */
export async function verifyEmail(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { token } = req.query

    if (!token || typeof token !== 'string') {
      res.status(400).json({ error: 'Verification token is required' })
      return
    }

    const result = await authService.verifyEmail(token)

    res.status(200).json(result)
  } catch (error) {
    next(error)
  }
}

/**
 * Get current user
 * GET /api/auth/me
 */
export async function getCurrentUser(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId) {
      throw new AppError('User not authenticated', 401)
    }

    const user = await authService.getCurrentUser(req.userId)

    res.status(200).json(user)
  } catch (error) {
    next(error)
  }
}
