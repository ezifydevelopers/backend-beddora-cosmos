/**
 * Multi-Currency Types
 */

export interface CurrencyRateResponse {
  from: string
  to: string
  rate: number
  fetchedAt: Date
}

export interface ExchangeRateUpdateResult {
  baseCurrency: string
  updatedCount: number
  fetchedAt: Date
}

