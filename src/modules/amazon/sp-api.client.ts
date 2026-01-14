import axios, { AxiosInstance, AxiosError } from 'axios'
import { logger } from '../../config/logger'

/**
 * Amazon SP API Client
 * 
 * Production-ready client for Amazon Selling Partner API
 * Features:
 * - Automatic token refresh
 * - Rate limiting and retry logic
 * - Comprehensive error handling
 * - Multi-marketplace support
 * - Request/response logging
 */

interface AccessTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
}

export interface AmazonCredentials {
  clientId: string
  clientSecret: string
  refreshToken: string
  region: string // 'us', 'eu', 'fe' (US, Europe, Far East)
  marketplaceId?: string // Default marketplace ID
}

interface RetryConfig {
  maxRetries: number
  retryDelay: number // milliseconds
  retryableStatusCodes: number[]
}

/**
 * Marketplace ID mappings
 * Maps marketplace codes to Amazon marketplace IDs
 */
const MARKETPLACE_IDS: Record<string, string> = {
  US: 'ATVPDKIKX0DER', // United States
  CA: 'A2EUQ1WTGCTBG2', // Canada
  MX: 'A1AM78C64UM0Y8', // Mexico
  BR: 'A2Q3Y263D00KWC', // Brazil
  UK: 'A1F83G8C2ARO7P', // United Kingdom
  DE: 'A1PA6795UKMFR9', // Germany
  FR: 'A13V1IB3VIYZZH', // France
  IT: 'APJ6JRA9NG5V4', // Italy
  ES: 'A1RKKUPIHCS9HS', // Spain
  NL: 'A1805IZSGTT6HS', // Netherlands
  SE: 'A2NODRKZP88ZB9', // Sweden
  PL: 'A1C3SOZRARQ6R3', // Poland
  JP: 'A1VC38T7YXB528', // Japan
  AU: 'A39IBJ37TRP1C6', // Australia
  IN: 'A21TJRUUN4KGV', // India
  SG: 'A19VAU5U5O7RUS', // Singapore
  AE: 'A2VIGQ35RCS4UG', // UAE
  SA: 'A17E79C6D8DWNP', // Saudi Arabia
  TR: 'A33AVAJ2PDY3EV', // Turkey
  EG: 'ARBP9OOSHTCHU', // Egypt
}

/**
 * Default retry configuration
 */
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  retryDelay: 1000, // 1 second
  retryableStatusCodes: [429, 500, 502, 503, 504], // Rate limit and server errors
}

export class AmazonSPAPIClient {
  private client: AxiosInstance
  private accessToken: string | null = null
  private tokenExpiresAt: number = 0
  private credentials: AmazonCredentials
  private retryConfig: RetryConfig

  constructor(credentials: AmazonCredentials, retryConfig?: Partial<RetryConfig>) {
    this.credentials = credentials
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...retryConfig }

    // Determine base URL based on region
    const baseURL = this.getBaseURL(credentials.region)

    this.client = axios.create({
      baseURL,
      timeout: 30000, // 30 seconds
      headers: {
        'Content-Type': 'application/json',
      },
    })

    // Add request interceptor for authentication
    this.client.interceptors.request.use(
      async (config) => {
        await this.ensureAccessToken()
        if (this.accessToken) {
          config.headers['x-amz-access-token'] = this.accessToken
        }
        return config
      },
      (error) => {
        return Promise.reject(error)
      }
    )

    // Add response interceptor for logging and error handling
    this.client.interceptors.response.use(
      (response) => {
        logger.debug('Amazon SP API request successful', {
          url: response.config.url,
          method: response.config.method,
        })
        return response
      },
      async (error: AxiosError) => {
        return this.handleError(error)
      }
    )
  }

  /**
   * Get base URL for SP API based on region
   */
  private getBaseURL(region: string): string {
    const regionMap: Record<string, string> = {
      us: 'https://sellingpartnerapi-na.amazon.com',
      eu: 'https://sellingpartnerapi-eu.amazon.com',
      fe: 'https://sellingpartnerapi-fe.amazon.com',
    }

    const normalizedRegion = region.toLowerCase()
    return regionMap[normalizedRegion] || regionMap.us
  }

  /**
   * Get access token using LWA (Login with Amazon)
   */
  private async getAccessToken(): Promise<string> {
    try {
      const response = await axios.post<AccessTokenResponse>(
        'https://api.amazon.com/auth/o2/token',
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: this.credentials.refreshToken,
          client_id: this.credentials.clientId,
          client_secret: this.credentials.clientSecret,
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      )

      this.accessToken = response.data.access_token
      // Set expiration with 1 minute buffer
      this.tokenExpiresAt = Date.now() + (response.data.expires_in * 1000) - 60000

      logger.debug('Amazon SP API access token refreshed')
      return this.accessToken
    } catch (error) {
      logger.error('Failed to get Amazon SP API access token', { error })
      throw new Error('Failed to authenticate with Amazon SP API')
    }
  }

  /**
   * Ensure access token is valid
   */
  private async ensureAccessToken(): Promise<void> {
    if (!this.accessToken || Date.now() >= this.tokenExpiresAt) {
      await this.getAccessToken()
    }
  }

  /**
   * Handle API errors with retry logic
   */
  private async handleError(error: AxiosError, retryCount = 0): Promise<any> {
    const status = error.response?.status
    const isRetryable = status && this.retryConfig.retryableStatusCodes.includes(status)

    // Log error
    logger.error('Amazon SP API request failed', {
      url: error.config?.url,
      method: error.config?.method,
      status,
      retryCount,
      error: error.message,
    })

    // Retry if applicable
    if (isRetryable && retryCount < this.retryConfig.maxRetries) {
      const delay = this.retryConfig.retryDelay * Math.pow(2, retryCount) // Exponential backoff
      logger.info(`Retrying Amazon SP API request after ${delay}ms`, {
        url: error.config?.url,
        retryCount: retryCount + 1,
      })

      await this.sleep(delay)
      return this.client.request(error.config!)
    }

    // Handle rate limiting
    if (status === 429) {
      const retryAfter = error.response?.headers['x-amzn-ratelimit-limit']
        ? parseInt(error.response.headers['x-amzn-ratelimit-limit'] as string) * 1000
        : 2000

      logger.warn('Rate limited by Amazon SP API', { retryAfter })
      await this.sleep(retryAfter)

      if (retryCount < this.retryConfig.maxRetries) {
        return this.client.request(error.config!)
      }
    }

    // Throw error if not retryable or max retries reached
    throw error
  }

  /**
   * Sleep utility for retries
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * Get marketplace ID from code
   */
  getMarketplaceId(marketplaceCode: string): string {
    return MARKETPLACE_IDS[marketplaceCode.toUpperCase()] || MARKETPLACE_IDS.US
  }

  // ============================================
  // ORDERS API
  // ============================================

  /**
   * Get orders from Amazon
   * 
   * @param marketplaceIds - Array of marketplace IDs
   * @param createdAfter - ISO date string
   * @param createdBefore - ISO date string
   * @param orderStatuses - Array of order statuses to filter
   */
  async getOrders(
    marketplaceIds: string[],
    createdAfter?: string,
    createdBefore?: string,
    orderStatuses?: string[]
  ) {
    const params: any = {
      MarketplaceIds: marketplaceIds.join(','),
    }

    if (createdAfter) {
      params.CreatedAfter = createdAfter
    }

    if (createdBefore) {
      params.CreatedBefore = createdBefore
    }

    if (orderStatuses && orderStatuses.length > 0) {
      params.OrderStatuses = orderStatuses.join(',')
    }

    const response = await this.client.get('/orders/v0/orders', { params })
    return response.data
  }

  /**
   * Get order by ID
   */
  async getOrder(orderId: string, marketplaceIds: string[]) {
    const params = {
      MarketplaceIds: marketplaceIds.join(','),
    }

    const response = await this.client.get(`/orders/v0/orders/${orderId}`, { params })
    return response.data
  }

  /**
   * Get order items
   */
  async getOrderItems(orderId: string) {
    const response = await this.client.get(`/orders/v0/orders/${orderId}/orderItems`)
    return response.data
  }

  // ============================================
  // FINANCIAL EVENTS API (Fees)
  // ============================================

  /**
   * Get financial events (fees, reimbursements, etc.)
   * 
   * @param postedAfter - ISO date string
   * @param postedBefore - ISO date string
   * @param maxResultsPerPage - Max results per page (1-100)
   */
  async getFinancialEvents(
    postedAfter?: string,
    postedBefore?: string,
    maxResultsPerPage: number = 100
  ) {
    const params: any = {
      MaxResultsPerPage: Math.min(Math.max(maxResultsPerPage, 1), 100),
    }

    if (postedAfter) {
      params.PostedAfter = postedAfter
    }

    if (postedBefore) {
      params.PostedBefore = postedBefore
    }

    const response = await this.client.get('/finances/v0/financialEvents', { params })
    return response.data
  }

  // ============================================
  // PPC / ADVERTISING API
  // ============================================

  /**
   * Get advertising profiles
   */
  async getAdvertisingProfiles() {
    const response = await this.client.get('/advertising/v2/profiles')
    return response.data
  }

  /**
   * Get PPC campaigns
   * 
   * @param profileId - Advertising profile ID
   * @param stateFilter - Campaign state filter
   */
  async getPPCCampaigns(profileId: string, stateFilter?: string) {
    const params: any = {}
    if (stateFilter) {
      params.stateFilter = stateFilter
    }

    const response = await this.client.get(`/advertising/v2/profiles/${profileId}/campaigns`, { params })
    return response.data
  }

  /**
   * Get PPC ad groups
   */
  async getPPCAdGroups(profileId: string, campaignId: string) {
    const response = await this.client.get(
      `/advertising/v2/profiles/${profileId}/adGroups`,
      { params: { campaignIdFilter: campaignId } }
    )
    return response.data
  }

  /**
   * Get PPC keywords
   */
  async getPPCKeywords(profileId: string, adGroupId?: string) {
    const params: any = {}
    if (adGroupId) {
      params.adGroupIdFilter = adGroupId
    }

    const response = await this.client.get(`/advertising/v2/profiles/${profileId}/keywords`, { params })
    return response.data
  }

  /**
   * Get PPC metrics (campaign, ad group, or keyword level)
   * 
   * @param profileId - Advertising profile ID
   * @param startDate - Start date (YYYY-MM-DD)
   * @param endDate - End date (YYYY-MM-DD)
   * @param metrics - Array of metric names
   * @param segment - Segment type (campaign, adGroup, keyword)
   */
  async getPPCMetrics(
    profileId: string,
    startDate: string,
    endDate: string,
    metrics: string[] = ['impressions', 'clicks', 'cost', 'attributedSales14d', 'attributedUnitsOrdered14d'],
    segment?: 'campaign' | 'adGroup' | 'keyword'
  ) {
    const params: any = {
      startDate,
      endDate,
      metrics: metrics.join(','),
    }

    if (segment) {
      params.segment = segment
    }

    const response = await this.client.get(`/advertising/v2/profiles/${profileId}/metrics`, { params })
    return response.data
  }

  // ============================================
  // INVENTORY API
  // ============================================

  /**
   * Get inventory summaries
   */
  async getInventorySummaries(
    marketplaceIds: string[],
    details: boolean = true,
    granularityType: string = 'Marketplace'
  ) {
    const params: any = {
      marketplaceIds: marketplaceIds.join(','),
      details: details.toString(),
      granularityType,
      granularityId: marketplaceIds[0], // Use first marketplace as granularity ID
    }

    const response = await this.client.get('/fba/inventory/v1/summaries', { params })
    return response.data
  }

  // ============================================
  // LISTINGS API
  // ============================================

  /**
   * Get listings (items)
   * 
   * @param marketplaceId - Marketplace ID
   * @param sellerSKU - Seller SKU (optional)
   */
  async getListings(marketplaceId: string, sellerSKU?: string) {
    const params: any = {
      MarketplaceId: marketplaceId,
    }

    if (sellerSKU) {
      params.SellerSKU = sellerSKU
    }

    const response = await this.client.get('/listings/2021-08-01/items', { params })
    return response.data
  }

  /**
   * Get Buy Box eligibility
   */
  async getBuyBoxEligibility(marketplaceId: string, sellerSKUs: string[]) {
    const params = {
      MarketplaceId: marketplaceId,
      SellerSKU: sellerSKUs.join(','),
    }

    const response = await this.client.get('/fba/inbound/v0/items', { params })
    return response.data
  }

  // ============================================
  // REFUNDS / RETURNS API
  // ============================================

  /**
   * Get returns
   * 
   * @param marketplaceIds - Array of marketplace IDs
   * @param createdAfter - ISO date string
   * @param createdBefore - ISO date string
   */
  async getReturns(
    marketplaceIds: string[],
    createdAfter?: string,
    createdBefore?: string
  ) {
    const params: any = {
      marketplaceIds: marketplaceIds.join(','),
    }

    if (createdAfter) {
      params.createdAfter = createdAfter
    }

    if (createdBefore) {
      params.createdBefore = createdBefore
    }

    const response = await this.client.get('/fba/inbound/v0/returns', { params })
    return response.data
  }

  // ============================================
  // PRODUCTS / CATALOG API
  // ============================================

  /**
   * Get product information
   */
  async getProduct(asin: string, marketplaceId: string) {
    const response = await this.client.get(`/catalog/v0/items/${asin}`, {
      params: {
        MarketplaceId: marketplaceId,
      },
    })
    return response.data
  }
}
