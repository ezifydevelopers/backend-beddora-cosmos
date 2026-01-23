/**
 * Money Transformers
 * 
 * Utilities for transforming Amazon Money objects
 */

import { parseMoney, parseCurrency, AmazonMoney } from './common.transformer'

/**
 * Transformed money object
 */
export interface TransformedMoney {
  amount: number | null
  currency: string | null
}

/**
 * Transform Amazon Money object to internal format
 * 
 * @param money - Amazon Money object
 * @returns Transformed money object
 */
export function transformMoney(money?: AmazonMoney | null): TransformedMoney {
  return {
    amount: parseMoney(money),
    currency: parseCurrency(money),
  }
}

/**
 * Transform multiple Money objects
 * 
 * @param moneyArray - Array of Money objects
 * @returns Array of transformed money objects
 */
export function transformMoneyArray(moneyArray?: AmazonMoney[] | null): TransformedMoney[] {
  if (!moneyArray || !Array.isArray(moneyArray)) return []
  return moneyArray.map(transformMoney)
}

/**
 * Sum multiple Money objects (must be same currency)
 * 
 * @param moneyArray - Array of Money objects
 * @param currency - Expected currency code
 * @returns Sum amount or null if currencies don't match
 */
export function sumMoney(moneyArray?: AmazonMoney[] | null, currency?: string): number | null {
  if (!moneyArray || !Array.isArray(moneyArray)) return null

  let total = 0
  let detectedCurrency: string | null = null

  for (const money of moneyArray) {
    const amount = parseMoney(money)
    if (amount === null) continue

    const moneyCurrency = parseCurrency(money)
    if (!moneyCurrency) continue

    // Check currency consistency
    if (currency && moneyCurrency !== currency) {
      return null // Currencies don't match
    }

    if (!detectedCurrency) {
      detectedCurrency = moneyCurrency
    } else if (detectedCurrency !== moneyCurrency) {
      return null // Mixed currencies
    }

    total += amount
  }

  return total
}
