import { Request, Response, NextFunction } from 'express'
import { logger } from '../../config/logger'
import { env } from '../../config/env'

// Extend Express Request to include userId from auth middleware
interface AuthRequest extends Request {
  userId?: string
}

/**
 * Diagnostic endpoint to check sandbox configuration
 * 
 * This endpoint helps debug sandbox setup issues by showing:
 * - Which environment variables are set
 * - Token format validation
 * - Configuration status
 * 
 * GET /api/amazon/sandbox/diagnostic
 */
export async function sandboxDiagnosticController(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Allow diagnostic without auth for testing (but log it)
    // In production, you might want to require auth
    if (!req.userId) {
      logger.warn('Sandbox diagnostic accessed without authentication', {
        ip: req.ip,
        userAgent: req.get('user-agent'),
      })
      // Still allow access for testing, but note it in response
    }

    // Check environment variables
    // Debug: Check raw env vars
    const rawSandboxClientSecret = process.env.SANDBOX_CLIENT_SECRET
    const rawAmazonClientSecret = process.env.AMAZON_SP_API_CLIENT_SECRET
    const resolvedClientSecret = env.sandboxClientSecret

    const config = {
      sandboxAppName: env.sandboxAppName || 'NOT SET',
      sandboxAppId: env.sandboxAppId ? `${env.sandboxAppId.substring(0, 20)}...` : 'NOT SET',
      sandboxRefreshToken: env.sandboxRefreshToken
        ? `${env.sandboxRefreshToken.substring(0, 20)}... (${env.sandboxRefreshToken.length} chars)`
        : 'NOT SET',
      sandboxClientSecret: resolvedClientSecret
        ? `${resolvedClientSecret.substring(0, 10)}... (SET, ${resolvedClientSecret.length} chars)`
        : 'NOT SET (Optional)',
      amazonSpApiRegion: env.amazonSpApiRegion || 'us-east-1 (default)',
      // Debug info (only in development)
      _debug: process.env.NODE_ENV === 'development' ? {
        hasSandboxClientSecret: !!rawSandboxClientSecret,
        hasAmazonClientSecret: !!rawAmazonClientSecret,
        sandboxClientSecretLength: rawSandboxClientSecret?.length || 0,
        amazonClientSecretLength: rawAmazonClientSecret?.length || 0,
        resolvedClientSecretLength: resolvedClientSecret?.length || 0,
      } : undefined,
    }

    // Validate token format
    const tokenValidation = {
      hasToken: !!env.sandboxRefreshToken,
      tokenLength: env.sandboxRefreshToken?.length || 0,
      startsWithAtzr: env.sandboxRefreshToken?.startsWith('Atzr|') || false,
      hasSpaces: env.sandboxRefreshToken?.includes(' ') || false,
      hasNewlines: env.sandboxRefreshToken?.includes('\n') || env.sandboxRefreshToken?.includes('\r') || false,
      isValidFormat: false,
    }

    tokenValidation.isValidFormat =
      tokenValidation.hasToken &&
      tokenValidation.startsWithAtzr &&
      tokenValidation.tokenLength > 100 &&
      !tokenValidation.hasSpaces &&
      !tokenValidation.hasNewlines

    // Validate App ID format
    const appIdValidation = {
      hasAppId: !!env.sandboxAppId,
      startsWithAmzn: env.sandboxAppId?.startsWith('amzn1.') || false,
      isApplicationType: env.sandboxAppId?.includes('application-oa2-client') || false,
      isSolutionType: env.sandboxAppId?.includes('sp.solution') || false,
      isValidFormat: false,
    }

    appIdValidation.isValidFormat =
      appIdValidation.hasAppId &&
      appIdValidation.startsWithAmzn &&
      (appIdValidation.isApplicationType || appIdValidation.isSolutionType)

    // Overall status
    const isConfigured =
      !!env.sandboxAppId &&
      !!env.sandboxRefreshToken &&
      tokenValidation.isValidFormat &&
      appIdValidation.isValidFormat

    const diagnostics = {
      status: isConfigured ? 'configured' : 'misconfigured',
      config,
      tokenValidation,
      appIdValidation,
      recommendations: [] as string[],
    }

    // Add recommendations
    if (!env.sandboxAppId) {
      diagnostics.recommendations.push('Set SANDBOX_APP_ID in .env file')
    } else if (!appIdValidation.isValidFormat) {
      diagnostics.recommendations.push(
        'SANDBOX_APP_ID format may be incorrect. Should start with "amzn1.application-oa2-client." or "amzn1.sp.solution."'
      )
    }

    if (!env.sandboxRefreshToken) {
      diagnostics.recommendations.push('Set SANDBOX_REFRESH_TOKEN in .env file')
    } else {
      if (!tokenValidation.startsWithAtzr) {
        diagnostics.recommendations.push('Refresh token should start with "Atzr|"')
      }
      if (tokenValidation.hasSpaces || tokenValidation.hasNewlines) {
        diagnostics.recommendations.push('Refresh token should be on a single line with no spaces')
      }
      if (tokenValidation.tokenLength < 100) {
        diagnostics.recommendations.push('Refresh token seems too short. Make sure you copied the entire token.')
      }
    }

    if (appIdValidation.isSolutionType && !appIdValidation.isApplicationType) {
      diagnostics.recommendations.push(
        'You are using a production solution ID. For sandbox, use an application ID (amzn1.application-oa2-client.xxx)'
      )
      // Solution IDs typically require client secret
      if (!env.sandboxClientSecret) {
        diagnostics.recommendations.push(
          'Solution IDs require a client secret. Add SANDBOX_CLIENT_SECRET to your .env file.'
        )
      }
    }

    res.status(200).json(diagnostics)
  } catch (error: any) {
    logger.error('Failed to run sandbox diagnostic', {
      error: error.message,
      stack: error.stack,
    })
    next(error)
  }
}
