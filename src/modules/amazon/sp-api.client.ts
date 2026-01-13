import axios, { AxiosInstance } from 'axios'
import { env } from '../../config/env'
import { logger } from '../../config/logger'

/**
 * Amazon SP API Client
 * Handles authentication and API calls to Amazon Selling Partner API
 * 
 * Future microservice: Extract to a separate amazon-sp-api-service
 * 
 * Documentation: https://developer-docs.amazon.com/sp-api/
 */

interface AccessTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
}

class AmazonSPAPIClient {
  private client: AxiosInstance
  private accessToken: string | null = null
  private tokenExpiresAt: number = 0

  constructor() {
    this.client = axios.create({
      baseURL: `https://sellingpartnerapi-${env.amazonSpApiRegion}.amazon.com`,
      headers: {
        'Content-Type': 'application/json',
      },
    })

    // Add request interceptor for authentication
    this.client.interceptors.request.use(async (config) => {
      await this.ensureAccessToken()
      if (this.accessToken) {
        config.headers.Authorization = `Bearer ${this.accessToken}`
      }
      return config
    })
  }

  /**
   * Get access token using LWA (Login with Amazon)
   * This should be called before making any API requests
   */
  private async getAccessToken(): Promise<string> {
    try {
      const response = await axios.post<AccessTokenResponse>(
        'https://api.amazon.com/auth/o2/token',
        {
          grant_type: 'refresh_token',
          refresh_token: env.amazonSpApiRefreshToken,
          client_id: env.amazonSpApiClientId,
          client_secret: env.amazonSpApiClientSecret,
        },
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      )

      this.accessToken = response.data.access_token
      this.tokenExpiresAt = Date.now() + (response.data.expires_in * 1000) - 60000 // 1 minute buffer

      return this.accessToken
    } catch (error) {
      logger.error('Failed to get Amazon SP API access token', error)
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
   * Get orders from Amazon
   */
  async getOrders(marketplaceIds: string[], createdAfter?: string, createdBefore?: string) {
    await this.ensureAccessToken()

    const params: any = {
      MarketplaceIds: marketplaceIds.join(','),
    }

    if (createdAfter) {
      params.CreatedAfter = createdAfter
    }

    if (createdBefore) {
      params.CreatedBefore = createdBefore
    }

    const response = await this.client.get('/orders/v0/orders', { params })
    return response.data
  }

  /**
   * Get order by ID
   */
  async getOrder(orderId: string) {
    await this.ensureAccessToken()

    const response = await this.client.get(`/orders/v0/orders/${orderId}`)
    return response.data
  }

  /**
   * Get product information
   */
  async getProduct(asin: string, marketplaceId: string) {
    await this.ensureAccessToken()

    const response = await this.client.get(`/catalog/v0/items/${asin}`, {
      params: {
        MarketplaceId: marketplaceId,
      },
    })
    return response.data
  }

  /**
   * Get inventory levels
   */
  async getInventory(sellerSku: string, marketplaceId: string) {
    await this.ensureAccessToken()

    const response = await this.client.get('/fba/inventory/v1/summaries', {
      params: {
        sellerSku,
        marketplaceId,
      },
    })
    return response.data
  }

  /**
   * Get PPC campaigns
   */
  async getPPCCampaigns(profileId: string) {
    await this.ensureAccessToken()

    // TODO: Implement SP-API advertising endpoints
    // This is a placeholder - actual implementation depends on SP-API advertising API
    logger.warn('PPC campaigns endpoint not yet implemented')
    return { campaigns: [] }
  }
}

// Export singleton instance
export const amazonSPAPIClient = new AmazonSPAPIClient()

