import dotenv from 'dotenv'

dotenv.config()

/**
 * Environment configuration
 * Validates and exports all environment variables
 */

interface EnvConfig {
  nodeEnv: string
  port: number
  apiPrefix: string
  databaseUrl: string
  jwtSecret: string
  jwtExpiresIn: string
  jwtRefreshSecret: string
  jwtRefreshExpiresIn: string
  corsOrigin: string
  smtpHost: string
  smtpPort: number
  smtpUser: string
  smtpPass: string
  emailFrom: string
  amazonSpApiClientId: string
  amazonSpApiClientSecret: string
  amazonSpApiRefreshToken: string
  amazonSpApiRegion: string
  amazonSpApiOAuthRedirectUri: string // OAuth redirect URI
  logLevel: string
  // Redis configuration (optional - app works without it)
  redisEnabled: boolean
  redisUrl?: string
  redisHost: string
  redisPort: number
  redisPassword?: string
  redisDb: number
  // Sandbox credentials (for testing SP-API integration - optional)
  sandboxAppName: string
  sandboxAppId: string
  sandboxRefreshToken: string
  sandboxClientSecret?: string // Optional, may be same as production client secret
}

/**
 * Get optional environment variable (returns empty string if not set)
 */
function getOptionalEnvVar(key: string, defaultValue: string = ''): string {
  return process.env[key] || defaultValue
}

function getEnvVar(key: string, defaultValue?: string): string {
  const value = process.env[key] || defaultValue
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`)
  }
  return value
}

export const env: EnvConfig = {
  nodeEnv: getEnvVar('NODE_ENV', 'development'),
  port: parseInt(getEnvVar('PORT', '3001'), 10),
  apiPrefix: getEnvVar('API_PREFIX', '/api'),
  databaseUrl: getEnvVar('DATABASE_URL'),
  jwtSecret: getEnvVar('JWT_SECRET', 'change-this-secret-in-production'),
  jwtExpiresIn: getEnvVar('JWT_EXPIRES_IN', '7d'),
  jwtRefreshSecret: getEnvVar('JWT_REFRESH_SECRET', 'change-this-refresh-secret'),
  jwtRefreshExpiresIn: getEnvVar('JWT_REFRESH_EXPIRES_IN', '30d'),
  corsOrigin: getEnvVar('CORS_ORIGIN', 'http://localhost:3000'),
  smtpHost: getEnvVar('SMTP_HOST', 'smtp.gmail.com'),
  smtpPort: parseInt(getEnvVar('SMTP_PORT', '587'), 10),
  smtpUser: getEnvVar('SMTP_USER', ''),
  smtpPass: getEnvVar('SMTP_PASS', ''),
  emailFrom: getEnvVar('EMAIL_FROM', 'noreply@beddora.com'),
  // Amazon SP-API credentials (optional - only required if using SP-API features)
  amazonSpApiClientId: getOptionalEnvVar('AMAZON_SP_API_CLIENT_ID'),
  amazonSpApiClientSecret: getOptionalEnvVar('AMAZON_SP_API_CLIENT_SECRET'),
  amazonSpApiRefreshToken: getOptionalEnvVar('AMAZON_SP_API_REFRESH_TOKEN'),
  amazonSpApiRegion: getOptionalEnvVar('AMAZON_SP_API_REGION', 'us-east-1'),
  amazonSpApiOAuthRedirectUri: getOptionalEnvVar('AMAZON_SP_API_OAUTH_REDIRECT_URI', 'http://localhost:5100/api/amazon/oauth/callback'),
  logLevel: getEnvVar('LOG_LEVEL', 'info'),
  // Redis configuration (optional - app works without it, uses in-memory fallback)
  redisEnabled: process.env.REDIS_ENABLED !== 'false', // Default to true unless explicitly disabled
  redisUrl: getOptionalEnvVar('REDIS_URL'),
  redisHost: getOptionalEnvVar('REDIS_HOST', 'localhost'),
  redisPort: parseInt(getOptionalEnvVar('REDIS_PORT', '6379'), 10),
  redisPassword: getOptionalEnvVar('REDIS_PASSWORD'),
  redisDb: parseInt(getOptionalEnvVar('REDIS_DB', '0'), 10),
  // Sandbox credentials (optional - only required for sandbox testing)
  // These are optional and won't cause app startup failure if not set
  // Note: For seller accounts, only SANDBOX_APP_NAME, SANDBOX_APP_ID, and SANDBOX_REFRESH_TOKEN are required
  // SANDBOX_CLIENT_SECRET is optional and should NOT fallback to production secret
  sandboxAppName: getOptionalEnvVar('SANDBOX_APP_NAME'),
  sandboxAppId: getOptionalEnvVar('SANDBOX_APP_ID'),
  sandboxRefreshToken: getOptionalEnvVar('SANDBOX_REFRESH_TOKEN'),
  sandboxClientSecret: getOptionalEnvVar('SANDBOX_CLIENT_SECRET'), // Only use if explicitly set (seller accounts typically don't need it)
}

