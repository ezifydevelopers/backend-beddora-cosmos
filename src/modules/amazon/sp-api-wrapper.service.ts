import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from 'axios'
import { createHash, createHmac } from 'crypto'
import { logger } from '../../config/logger'
import { AppError } from '../../middlewares/error.middleware'
import { getAccessToken, LWACredentials } from './token.service'
import { assumeRole, IAMCredentials } from './iam.service'
import prisma from '../../config/db'
import { decrypt } from '../../utils/encryption'

/**
 * SP-API Client Wrapper Service
 * 
 * Production-ready generic wrapper for Amazon Selling Partner API calls.
 * 
 * Responsibilities:
 * - Accepts seller context (AmazonAccount ID)
 * - Retrieves and decrypts stored credentials
 * - Exchanges refresh token for access token
 * - Assumes IAM role for request signing
 * - Makes authenticated SP-API calls
 * - Handles retries and errors
 * 
 * Architecture:
 * - This wrapper is reusable for ALL SP-API endpoints:
 *   - Orders API
 *   - Reports API
 *   - FBA Inventory API
 *   - Fees / Settlements API
 *   - Product Pricing API
 *   - etc.
 * - Can be extracted to a separate microservice in the future
 * 
 * Usage Example:
 * ```typescript
 * const client = new SPAPIWrapper(amazonAccountId)
 * const orders = await client.get('/orders/v0/orders', { MarketplaceIds: ['ATVPDKIKX0DER'] })
 * ```
 */

export interface SPAPIRequestConfig extends AxiosRequestConfig {
  marketplaceId?: string
  retryCount?: number
}

/**
 * SP-API Base URLs by Region
 */
const SP_API_BASE_URLS: Record<string, string> = {
  'us-east-1': 'https://sellingpartnerapi-na.amazon.com',
  'eu-west-1': 'https://sellingpartnerapi-eu.amazon.com',
  'us-west-2': 'https://sellingpartnerapi-fe.amazon.com',
}

// Marketplace ID mappings are available in account.marketplaceIds
// Keeping this for reference but not using it directly

/**
 * Get SP-API base URL for region
 */
function getSPAPIBaseURL(region: string): string {
  // Map region to SP-API endpoint
  if (region.includes('us-') || region.includes('na')) {
    return SP_API_BASE_URLS['us-east-1']
  }
  if (region.includes('eu-') || region.includes('eu')) {
    return SP_API_BASE_URLS['eu-west-1']
  }
  if (region.includes('ap-') || region.includes('fe')) {
    return SP_API_BASE_URLS['us-west-2']
  }
  return SP_API_BASE_URLS['us-east-1'] // Default
}

/**
 * Sign SP-API request using AWS Signature Version 4
 * 
 * This is required for all SP-API requests when using IAM role credentials.
 * 
 * Note: SP-API uses a simplified signing process compared to standard AWS services.
 * The access token is passed in the x-amz-access-token header, and IAM credentials
 * are used to sign the request.
 */
function signRequest(
  config: AxiosRequestConfig,
  credentials: IAMCredentials,
  region: string
): AxiosRequestConfig {
  const method = (config.method || 'GET').toUpperCase()
  
  // Build full URL
  const baseURL = config.baseURL || ''
  const urlPath = config.url || ''
  const fullUrl = urlPath.startsWith('http') ? urlPath : `${baseURL}${urlPath}`
  const url = new URL(fullUrl)
  
  const path = url.pathname
  const queryString = url.search.substring(1) // Remove leading '?'
  const host = url.hostname
  const service = 'execute-api'
  
  // Generate timestamp
  const now = new Date()
  const timestamp = now.toISOString().replace(/[:\-]|\.\d{3}/g, '')
  const date = timestamp.substr(0, 8)

  // Prepare request body
  const requestBody = config.data ? (typeof config.data === 'string' ? config.data : JSON.stringify(config.data)) : ''
  const payloadHash = createHash('sha256').update(requestBody).digest('hex')

  // Create canonical headers
  const canonicalHeaders = [
    `host:${host}`,
    `x-amz-access-token:${config.headers?.['x-amz-access-token'] || ''}`,
    `x-amz-date:${timestamp}`,
  ].join('\n') + '\n'

  const signedHeaders = 'host;x-amz-access-token;x-amz-date'

  // Create canonical request
  const canonicalRequest = [
    method,
    path,
    queryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n')

  // Create string to sign
  const algorithm = 'AWS4-HMAC-SHA256'
  const credentialScope = `${date}/${region}/${service}/aws4_request`
  const canonicalRequestHash = createHash('sha256').update(canonicalRequest).digest('hex')
  const stringToSign = `${algorithm}\n${timestamp}\n${credentialScope}\n${canonicalRequestHash}`

  // Calculate signature
  const kDate = createHmac('sha256', `AWS4${credentials.secretAccessKey}`).update(date).digest()
  const kRegion = createHmac('sha256', kDate).update(region).digest()
  const kService = createHmac('sha256', kRegion).update(service).digest()
  const kSigning = createHmac('sha256', kService).update('aws4_request').digest()
  const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex')

  // Add authorization header
  const authorization = `${algorithm} Credential=${credentials.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

  return {
    ...config,
    headers: {
      ...config.headers,
      'x-amz-date': timestamp,
      'Authorization': authorization,
      'x-amz-security-token': credentials.sessionToken,
    },
  }
}

export class SPAPIWrapper {
  private amazonAccountId: string
  private accessToken: string | null = null
  private iamCredentials: IAMCredentials | null = null
  private client: AxiosInstance
  private region: string = 'us-east-1'
  private lwaCredentials: LWACredentials | null = null
  private iamRoleArn: string | null = null

  constructor(amazonAccountId: string) {
    this.amazonAccountId = amazonAccountId
    this.client = axios.create({
      timeout: 30000, // 30 seconds
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }

  /**
   * Initialize the wrapper by loading credentials from database
   */
  async initialize(): Promise<void> {
    const account = await prisma.amazonAccount.findUnique({
      where: { id: this.amazonAccountId },
    })

    if (!account) {
      throw new AppError('Amazon account not found', 404)
    }

    if (!account.isActive) {
      throw new AppError('Amazon account is not active', 400)
    }

    // Decrypt credentials
    // Note: After running Prisma migration, these fields will be available
    // For now, using type assertion to access new fields
    try {
      const accountWithNewFields = account as any
      const lwaClientId = decrypt(accountWithNewFields.lwaClientId || accountWithNewFields.accessKey)
      // Client secret is optional - decrypt only if present and not empty
      const encryptedClientSecret = accountWithNewFields.lwaClientSecret || accountWithNewFields.secretKey
      const lwaClientSecret = encryptedClientSecret && encryptedClientSecret.trim() !== '' 
        ? decrypt(encryptedClientSecret) 
        : '' // Empty string if not provided (Application IDs may not need it)
      const refreshToken = decrypt(account.refreshToken)

      this.lwaCredentials = {
        clientId: lwaClientId,
        clientSecret: lwaClientSecret || undefined, // Use undefined instead of empty string
        refreshToken,
      }

      this.region = accountWithNewFields.region || 'us-east-1'
      this.iamRoleArn = accountWithNewFields.iamRoleArn || null

      // Set base URL
      const baseURL = getSPAPIBaseURL(this.region)
      this.client.defaults.baseURL = baseURL
    } catch (error) {
      logger.error('Failed to decrypt Amazon account credentials', {
        amazonAccountId: this.amazonAccountId,
        error: (error as Error).message,
      })
      throw new AppError('Failed to decrypt Amazon account credentials', 500)
    }
  }

  /**
   * Ensure access token is valid and refresh if needed
   * 
   * CRITICAL: Handles token rotation - if Amazon returns a new refresh_token,
   * it must be persisted to the database to prevent account disconnection.
   */
  private async ensureAccessToken(): Promise<void> {
    if (!this.lwaCredentials) {
      await this.initialize()
    }

    // Check if we have a cached token and if it's still valid
    // Access tokens typically expire in 1 hour, so we refresh proactively
    const needsRefresh = !this.accessToken

    if (needsRefresh && this.lwaCredentials) {
      const tokenResponse = await getAccessToken(this.lwaCredentials, this.region)
      this.accessToken = tokenResponse.access_token

      // CRITICAL: Handle token rotation
      // If Amazon returns a new refresh_token, we MUST save it to the database
      // Otherwise, the old token becomes invalid and the account will disconnect
      if (tokenResponse.refresh_token && tokenResponse.refresh_token !== this.lwaCredentials.refreshToken) {
        logger.info('Amazon rotated refresh token - updating database', {
          amazonAccountId: this.amazonAccountId,
        })

        try {
          // Import encryption function
          const { encrypt } = await import('../../utils/encryption')
          
          // Get account to find userId for audit log
          const account = await prisma.amazonAccount.findUnique({
            where: { id: this.amazonAccountId },
            select: { userId: true },
          })

          // Update refresh token in database
          await prisma.amazonAccount.update({
            where: { id: this.amazonAccountId },
            data: {
              refreshToken: encrypt(tokenResponse.refresh_token),
              lastTokenRefreshAt: new Date(),
            } as any,
          })

          // Update local credentials with new refresh token
          this.lwaCredentials.refreshToken = tokenResponse.refresh_token

          // Clear old token from cache (if using cache key based on refresh token)
          const { clearTokenCache } = await import('./token.service')
          await clearTokenCache(this.lwaCredentials.clientId, this.lwaCredentials.refreshToken)

          // Audit token rotation
          if (account) {
            const { auditTokenRefresh } = await import('../../utils/audit.service')
            await auditTokenRefresh(account.userId, this.amazonAccountId, true)
          }

          logger.info('Successfully updated rotated refresh token in database', {
            amazonAccountId: this.amazonAccountId,
          })
        } catch (error) {
          logger.error('CRITICAL: Failed to persist rotated refresh token', {
            amazonAccountId: this.amazonAccountId,
            error: (error as Error).message,
          })
          // This is critical - if we can't save the new token, the account will disconnect
          // We still proceed but log the error for immediate attention
        }
      } else {
        // No token rotation, just update last refresh time
        try {
          await prisma.amazonAccount.update({
            where: { id: this.amazonAccountId },
            data: { lastTokenRefreshAt: new Date() } as any,
          })
        } catch (error) {
          logger.debug('Could not update lastTokenRefreshAt (field may not exist yet)', {
            amazonAccountId: this.amazonAccountId,
          })
        }
      }
    }
  }

  /**
   * Ensure IAM credentials are valid and assume role if needed
   * 
   * Note: Most SP-API endpoints require IAM role assumption for request signing.
   * Only a few endpoints (like token exchange) work with just access token.
   */
  private async ensureIAMCredentials(): Promise<void> {
    if (!this.iamRoleArn) {
      // If no IAM role is configured, log a warning for endpoints that typically require it
      // Some SP-API endpoints don't require IAM role, but most do
      logger.debug('No IAM role configured - some SP-API endpoints may fail', {
        amazonAccountId: this.amazonAccountId,
      })
      return
    }

    // Check if credentials are expired or missing
    const now = new Date()
    const needsRefresh = !this.iamCredentials || this.iamCredentials.expiration <= now

    if (needsRefresh) {
      this.iamCredentials = await assumeRole(this.iamRoleArn, this.region)
    }
  }

  /**
   * Validate that IAM role is configured for endpoints that require it
   * 
   * Most SP-API endpoints require IAM role for request signing.
   * This validation helps catch configuration errors early.
   */
  private validateIAMRoleForEndpoint(endpoint: string): void {
    // Endpoints that typically don't require IAM role (token exchange, etc.)
    const endpointsWithoutIAM = [
      '/auth/o2/token', // Token exchange endpoint
    ]

    const requiresIAM = !endpointsWithoutIAM.some((e) => endpoint.includes(e))

    if (requiresIAM && !this.iamRoleArn) {
      logger.warn('SP-API endpoint typically requires IAM role, but none is configured', {
        endpoint,
        amazonAccountId: this.amazonAccountId,
      })
      // Don't throw error - let the API call fail naturally with a clear error message
      // This allows for edge cases where IAM might not be required
    }
  }

  /**
   * Make authenticated SP-API request
   * 
   * @param endpoint - SP-API endpoint (e.g., '/orders/v0/orders')
   * @param config - Axios request configuration
   * @returns Response data
   */
  async request<T = any>(endpoint: string, config: SPAPIRequestConfig = {}): Promise<T> {
    // Validate IAM role for endpoints that require it (warns but doesn't block)
    this.validateIAMRoleForEndpoint(endpoint)

    // Ensure credentials are ready
    await this.ensureAccessToken()
    await this.ensureIAMCredentials()

    // Prepare request config
    const requestConfig: AxiosRequestConfig = {
      ...config,
      url: endpoint,
      headers: {
        ...config.headers,
        'x-amz-access-token': this.accessToken!,
      },
    }

    // Sign request if IAM credentials are available
    // Note: Most SP-API endpoints require IAM role for request signing
    if (this.iamCredentials) {
      Object.assign(requestConfig, signRequest(requestConfig, this.iamCredentials, this.region))
    } else {
      logger.debug('Making SP-API request without IAM signing (may fail for most endpoints)', {
        endpoint,
        amazonAccountId: this.amazonAccountId,
      })
    }

    // Retry logic with proper rate limit handling
    const maxRetries = config.retryCount || 3
    let lastError: any

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await this.client.request<T>(requestConfig)
        return response.data
      } catch (error) {
        const axiosError = error as AxiosError
        lastError = error

        if (axiosError.response) {
          const status = axiosError.response.status

          // Handle rate limiting (429) - MUST retry with proper backoff
          if (status === 429) {
            // Parse Retry-After header if available
            const retryAfterHeader = axiosError.response.headers['retry-after'] || 
                                   axiosError.response.headers['x-amzn-ratelimit-limit']
            let retryDelay = 5000 // Default 5 seconds

            if (retryAfterHeader) {
              const retryAfter = parseInt(retryAfterHeader as string, 10)
              if (!isNaN(retryAfter)) {
                retryDelay = retryAfter * 1000 // Convert to milliseconds
              }
            } else {
              // Exponential backoff for rate limits: 5s, 10s, 20s
              retryDelay = Math.min(5000 * Math.pow(2, attempt), 30000) // Cap at 30 seconds
            }

            if (attempt < maxRetries - 1) {
              logger.warn(`Rate limit exceeded (429), retrying after ${retryDelay}ms... (attempt ${attempt + 1}/${maxRetries})`, {
                endpoint,
                attempt: attempt + 1,
                retryDelay,
                retryAfter: retryAfterHeader,
              })
              await new Promise((resolve) => setTimeout(resolve, retryDelay))
              continue // Retry the request
            }
          }

          // Don't retry on other 4xx errors (client errors) except 429
          if (status >= 400 && status < 500 && status !== 429) {
            throw this.handleError(axiosError)
          }
        }

        // Retry on 5xx errors or network errors
        if (attempt < maxRetries - 1) {
          const delay = Math.pow(2, attempt) * 1000 // Exponential backoff: 1s, 2s, 4s
          logger.warn(`SP-API request failed, retrying... (attempt ${attempt + 1}/${maxRetries})`, {
            endpoint,
            attempt: attempt + 1,
            delay,
            error: axiosError.message,
            status: axiosError.response?.status,
          })
          await new Promise((resolve) => setTimeout(resolve, delay))
        }
      }
    }

    // All retries failed
    throw this.handleError(lastError)
  }

  /**
   * GET request helper
   */
  async get<T = any>(endpoint: string, params?: any, config?: SPAPIRequestConfig): Promise<T> {
    return this.request<T>(endpoint, {
      ...config,
      method: 'GET',
      params,
    })
  }

  /**
   * POST request helper
   */
  async post<T = any>(endpoint: string, data?: any, config?: SPAPIRequestConfig): Promise<T> {
    return this.request<T>(endpoint, {
      ...config,
      method: 'POST',
      data,
    })
  }

  /**
   * PUT request helper
   */
  async put<T = any>(endpoint: string, data?: any, config?: SPAPIRequestConfig): Promise<T> {
    return this.request<T>(endpoint, {
      ...config,
      method: 'PUT',
      data,
    })
  }

  /**
   * DELETE request helper
   */
  async delete<T = any>(endpoint: string, config?: SPAPIRequestConfig): Promise<T> {
    return this.request<T>(endpoint, {
      ...config,
      method: 'DELETE',
    })
  }

  /**
   * Handle SP-API errors
   */
  private handleError(error: any): AppError {
    const axiosError = error as AxiosError

    if (axiosError.response) {
      const status = axiosError.response.status
      const data = axiosError.response.data as any

      if (status === 401) {
        return new AppError('Unauthorized - access token may be expired', 401)
      }

      if (status === 403) {
        return new AppError('Forbidden - check IAM role permissions', 403)
      }

      if (status === 429) {
        return new AppError('Rate limit exceeded - too many requests', 429)
      }

      if (status >= 500) {
        return new AppError('Amazon SP-API server error', 500)
      }

      return new AppError(
        data?.errors?.[0]?.message || data?.message || 'SP-API request failed',
        status
      )
    }

    if (axiosError.code === 'ECONNABORTED') {
      return new AppError('Request timeout', 504)
    }

    return new AppError('Network error during SP-API request', 500)
  }
}
