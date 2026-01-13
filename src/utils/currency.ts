/**
 * Currency utility functions
 */

/**
 * Format number as currency
 */
export function formatCurrency(amount: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount)
}

/**
 * Round to 2 decimal places
 */
export function roundCurrency(amount: number): number {
  return Math.round(amount * 100) / 100
}

/**
 * Calculate percentage
 */
export function calculatePercentage(value: number, total: number): number {
  if (total === 0) return 0
  return roundCurrency((value / total) * 100)
}

