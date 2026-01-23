import axios, { AxiosInstance, AxiosError } from 'axios'
import { logger } from '../../config/logger'
import { AppError } from '../../middlewares/error.middleware'
import { getAccessToken, LWACredentials } from './token.service'
import { getAmazonAccount } from './account.service'
import { env } from '../../config/env'

/**
 * Sandbox SP-API Service
 * 
 * Production-ready service for testing Amazon SP-API integration in sandbox mode.
 * 
 * Responsibilities:
 * - Load sandbox credentials from environment variables
 * - Exchange sandbox refresh token for access token
 * - Make SP-API calls to sandbox endpoints
 * - Return sandbox orders data
 * 
 * Architecture:
 * - This service is modular and can be extracted to a separate microservice
 * - Reuses existing token.service.ts for token exchange
 * - No database dependencies (uses environment variables)
 * - Can be extended for other sandbox endpoints (Reports, Inventory, etc.)
 * 
 * Security:
 * - Never logs refresh tokens
 * - Never exposes tokens to frontend
 * - Uses environment variables for credentials
 * - No hardcoded secrets
 */

/**
 * Sandbox Order from SP-API
 */
export interface SandboxOrder {
  orderId: string
  orderDate: string
  marketplace: string
  totalAmount: number
  currency?: string
  orderStatus?: string
  [key: string]: any // Allow additional fields from API
}

/**
 * Sandbox Orders Response
 */
export interface SandboxOrdersResponse {
  success: boolean
  data: SandboxOrder[]
  message?: string
  timestamp: string
}

/**
 * SP-API Base URLs by Region
 * Sandbox uses the same endpoints as production
 */
const SP_API_BASE_URLS: Record<string, string> = {
  'us-east-1': 'https://sellingpartnerapi-na.amazon.com',
  'eu-west-1': 'https://sellingpartnerapi-eu.amazon.com',
  'us-west-2': 'https://sellingpartnerapi-fe.amazon.com',
}

/**
 * Get SP-API base URL for region
 */
function getSPAPIBaseURL(region: string): string {
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
 * Get sandbox credentials from environment variables
 * 
 * Fallback method when amazonAccountId is not provided.
 * Uses credentials from .env file (SANDBOX_APP_ID, SANDBOX_REFRESH_TOKEN, etc.)
 * 
 * Note: For seller accounts, client secret may not be required.
 * The token exchange will be attempted without it if not provided.
 * 
 * @returns LWA credentials for sandbox
 * @throws AppError if required credentials are missing
 */
function getSandboxCredentialsFromEnv(): { credentials: LWACredentials; region: string } {
  const clientId = env.sandboxAppId
  // For seller accounts, client secret is NOT required
  // Only use SANDBOX_CLIENT_SECRET if explicitly set (don't fallback to production secret)
  const clientSecret = env.sandboxClientSecret || ''
  const refreshToken = env.sandboxRefreshToken

  if (!clientId) {
    throw new AppError(
      'SANDBOX_APP_ID environment variable is required when amazonAccountId is not provided',
      400
    )
  }

  if (!refreshToken) {
    throw new AppError(
      'SANDBOX_REFRESH_TOKEN environment variable is required when amazonAccountId is not provided',
      400
    )
  }

  // Client secret is optional for seller accounts
  // If not provided, token exchange will be attempted without it
  // Seller accounts typically only need: App ID, App Name, and Refresh Token

  logger.info('Loading sandbox credentials from environment', {
    hasClientId: !!clientId,
    hasRefreshToken: !!refreshToken,
    hasClientSecret: !!clientSecret && clientSecret.trim() !== '',
    clientIdPrefix: clientId ? clientId.substring(0, 20) + '...' : 'NOT SET',
  })

  return {
    credentials: {
      clientId,
      clientSecret: clientSecret || '', // Empty string if not provided (seller accounts don't need it)
      refreshToken,
    },
    region: env.amazonSpApiRegion || 'us-east-1',
  }
}

/**
 * Get sandbox credentials from database (AmazonAccount)
 * 
 * Retrieves and decrypts credentials from the AmazonAccount stored in the database.
 * This allows using a single account without requiring environment variables.
 * 
 * @param amazonAccountId - AmazonAccount ID from database
 * @param userId - User ID for authorization check
 * @returns LWA credentials for sandbox
 * @throws AppError if account not found or unauthorized
 */
async function getSandboxCredentialsFromDB(
  amazonAccountId: string,
  userId: string
): Promise<{ credentials: LWACredentials; region: string }> {
  // Get account from database (with decrypted credentials)
  // SECURITY: getAmazonAccount now verifies userId ownership internally
  const account = await getAmazonAccount(amazonAccountId, userId, true) // includeDecrypted = true

  // Verify account is active
  if (!account.isActive) {
    throw new AppError('Amazon account is not active', 400)
  }

  // Decrypt credentials
  const accountWithNewFields = account as any
  const lwaClientId = accountWithNewFields.lwaClientId || accountWithNewFields.accessKey
  const lwaClientSecret = accountWithNewFields.lwaClientSecret || accountWithNewFields.secretKey || ''
  const refreshToken = account.refreshToken

  // Validate required fields
  // Note: clientSecret is optional for seller accounts
  if (!lwaClientId || !refreshToken) {
    throw new AppError('Amazon account is missing required credentials: lwaClientId and refreshToken are required', 400)
  }

  const credentials: LWACredentials = {
    clientId: lwaClientId,
    clientSecret: lwaClientSecret || '', // Empty string if not provided (optional for seller accounts)
    refreshToken: refreshToken,
  }

  const region = accountWithNewFields.region || 'us-east-1'

  return { credentials, region }
}

/**
 * Create SP-API client for sandbox
 * 
 * Note: Sandbox mode may not require IAM role assumption for some endpoints.
 * This simplified client uses only the access token.
 * 
 * @param accessToken - LWA access token
 * @param region - AWS region (defaults to us-east-1)
 * @returns Configured Axios instance
 */
function createSandboxSPAPIClient(accessToken: string, region: string = 'us-east-1'): AxiosInstance {
  const baseURL = getSPAPIBaseURL(region)

  return axios.create({
    baseURL,
    timeout: 30000, // 30 seconds
    headers: {
      'Content-Type': 'application/json',
      'x-amz-access-token': accessToken,
    },
  })
}

/**
 * Fetch sandbox orders from SP-API
 * 
 * This function:
 * 1. Gets sandbox credentials from database (AmazonAccount) OR environment variables
 * 2. Exchanges refresh token for access token
 * 3. Makes SP-API call to fetch orders
 * 4. Transforms response to our format
 * 
 * @param amazonAccountId - AmazonAccount ID from database (optional - if not provided, uses env vars)
 * @param userId - User ID for authorization (required if amazonAccountId is provided)
 * @param marketplaceId - Marketplace ID (optional, defaults to US)
 * @param createdAfter - ISO date string (optional, defaults to 7 days ago)
 * @returns Sandbox orders response
 * @throws AppError if any step fails
 */
export async function getSandboxOrders(
  amazonAccountId: string | undefined,
  userId: string | undefined,
  marketplaceId: string = 'ATVPDKIKX0DER', // US marketplace
  createdAfter?: string
): Promise<SandboxOrdersResponse> {
  try {
    let credentials: LWACredentials
    let region: string

    // Step 1: Get sandbox credentials from database OR environment variables
    if (amazonAccountId && userId) {
      // Use database account
      logger.info('Loading sandbox credentials from database', {
        amazonAccountId,
        userId,
      })
      const dbCredentials = await getSandboxCredentialsFromDB(amazonAccountId, userId)
      credentials = dbCredentials.credentials
      region = dbCredentials.region
    } else {
      // Use environment variables (fallback for quick testing)
      logger.info('Loading sandbox credentials from environment variables', {
        appName: env.sandboxAppName || 'Not set',
        appId: env.sandboxAppId ? env.sandboxAppId.substring(0, 10) + '...' : 'Not set',
      })
      const envCredentials = getSandboxCredentialsFromEnv()
      credentials = envCredentials.credentials
      region = envCredentials.region
    }

    // Step 2: Exchange refresh token for access token
    logger.info('Exchanging sandbox refresh token for access token', {
      amazonAccountId,
    })
    const tokenResponse = await getAccessToken(credentials, region)

    if (!tokenResponse.access_token) {
      throw new AppError('Failed to obtain access token from Amazon', 500)
    }

    logger.info('Successfully obtained sandbox access token', {
      expiresIn: tokenResponse.expires_in,
    })

    // Step 3: Create SP-API client
    const client = createSandboxSPAPIClient(tokenResponse.access_token, region)

    // Step 4: Build query parameters
    const params: any = {
      MarketplaceIds: [marketplaceId],
    }

    // Add createdAfter if provided, otherwise default to 7 days ago
    if (createdAfter) {
      params.CreatedAfter = createdAfter
    } else {
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
      params.CreatedAfter = sevenDaysAgo.toISOString()
    }

    // Step 5: Make SP-API call to fetch orders
    logger.info('Fetching sandbox orders from SP-API', {
      marketplaceId,
      createdAfter: params.CreatedAfter,
    })

    const response = await client.get('/orders/v0/orders', { params })

    // Step 6: Transform response to our format
    const ordersData = response.data

    // SP-API returns orders in payload.Orders array
    const orders: SandboxOrder[] = (ordersData?.payload?.Orders || []).map((order: any) => ({
      orderId: order.AmazonOrderId || order.OrderId || '',
      orderDate: order.PurchaseDate || order.OrderDate || '',
      marketplace: order.MarketplaceId || marketplaceId,
      totalAmount: parseFloat(order.OrderTotal?.Amount || '0') || 0,
      currency: order.OrderTotal?.CurrencyCode || 'USD',
      orderStatus: order.OrderStatus || 'Unknown',
      // Include additional fields from API
      ...order,
    }))

    logger.info('Successfully fetched sandbox orders', {
      orderCount: orders.length,
      marketplaceId,
    })

    return {
      success: true,
      data: orders,
      message: `Successfully retrieved ${orders.length} sandbox order(s)`,
      timestamp: new Date().toISOString(),
    }
  } catch (error: any) {
    // Handle specific error cases
    if (error instanceof AppError) {
      throw error
    }

    const axiosError = error as AxiosError

    if (axiosError.response) {
      const status = axiosError.response.status
      const data = axiosError.response.data as any

      logger.error('SP-API sandbox request failed', {
        status,
        error: data?.errors?.[0]?.message || data?.message || axiosError.message,
        marketplaceId,
      })

      if (status === 401) {
        throw new AppError('Unauthorized - sandbox access token may be expired', 401)
      }

      if (status === 403) {
        throw new AppError(
          'Forbidden - check sandbox application permissions and IAM role configuration',
          403
        )
      }

      if (status === 429) {
        throw new AppError('Rate limit exceeded - too many sandbox requests', 429)
      }

      if (status >= 500) {
        throw new AppError('Amazon SP-API sandbox server error', 500)
      }

      throw new AppError(
        data?.errors?.[0]?.message || data?.message || 'Failed to fetch sandbox orders',
        status
      )
    }

    if (axiosError.code === 'ECONNABORTED') {
      logger.error('Timeout while fetching sandbox orders', { marketplaceId })
      throw new AppError('Request timeout while fetching sandbox orders', 504)
    }

    logger.error('Unexpected error while fetching sandbox orders', {
      error: error.message,
      marketplaceId,
    })
    throw new AppError('Unexpected error while fetching sandbox orders', 500)
  }
}

/**
 * Test sandbox connection
 * 
 * This function tests the sandbox connection without fetching orders.
 * Useful for verifying credentials and token exchange.
 * 
 * @param amazonAccountId - AmazonAccount ID from database (optional - if not provided, uses env vars)
 * @param userId - User ID for authorization (required if amazonAccountId is provided)
 * @returns Connection status
 */
export async function testSandboxConnection(
  amazonAccountId: string | undefined,
  userId: string | undefined
): Promise<{
  success: boolean
  message: string
  amazonAccountId?: string
  amazonSellerId?: string
  marketplace?: string
  appName?: string
  appId?: string
  tokenValid: boolean
  timestamp: string
}> {
  try {
    let credentials: LWACredentials
    let region: string
    let accountInfo: { amazonSellerId?: string; marketplace?: string; appName?: string; appId?: string } = {}

    // Get credentials from database OR environment variables
    if (amazonAccountId && userId) {
      // Use database account
      logger.info('Testing sandbox connection with database account', {
        amazonAccountId,
        userId,
      })
      const dbCredentials = await getSandboxCredentialsFromDB(amazonAccountId, userId)
      credentials = dbCredentials.credentials
      region = dbCredentials.region

      // SECURITY: getAmazonAccount now verifies userId ownership internally
      const account = await getAmazonAccount(amazonAccountId, userId, false) // Don't need decrypted for basic info
      const accountWithNewFields = account as any
      accountInfo = {
        amazonSellerId: accountWithNewFields.amazonSellerId || accountWithNewFields.sellerId,
        marketplace: account.marketplace,
      }
    } else {
      // Use environment variables
      logger.info('Testing sandbox connection with environment variables')
      const envCredentials = getSandboxCredentialsFromEnv()
      credentials = envCredentials.credentials
      region = envCredentials.region
      accountInfo = {
        appName: env.sandboxAppName,
        appId: env.sandboxAppId ? env.sandboxAppId.substring(0, 10) + '...' : undefined,
      }
    }

    // Test token exchange
    const tokenResponse = await getAccessToken(credentials, region)

    return {
      success: true,
      message: 'Sandbox connection successful - credentials validated and token exchange successful',
      amazonAccountId: amazonAccountId || undefined,
      ...accountInfo,
      tokenValid: !!tokenResponse.access_token,
      timestamp: new Date().toISOString(),
    }
  } catch (error: any) {
    logger.error('Sandbox connection test failed', {
      error: error.message,
      amazonAccountId,
      userId,
    })

    return {
      success: false,
      message: error.message || 'Sandbox connection test failed',
      amazonAccountId: amazonAccountId || undefined,
      tokenValid: false,
      timestamp: new Date().toISOString(),
    }
  }
}
