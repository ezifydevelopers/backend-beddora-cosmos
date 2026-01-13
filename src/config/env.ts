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
  logLevel: string
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
  amazonSpApiClientId: getEnvVar('AMAZON_SP_API_CLIENT_ID', ''),
  amazonSpApiClientSecret: getEnvVar('AMAZON_SP_API_CLIENT_SECRET', ''),
  amazonSpApiRefreshToken: getEnvVar('AMAZON_SP_API_REFRESH_TOKEN', ''),
  amazonSpApiRegion: getEnvVar('AMAZON_SP_API_REGION', 'us-east-1'),
  logLevel: getEnvVar('LOG_LEVEL', 'info'),
}

