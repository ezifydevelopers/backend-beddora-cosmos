/**
 * Common Transformers
 * 
 * Shared transformation utilities used across all transformers
 */

/**
 * Amazon Money object structure
 */
export interface AmazonMoney {
  Amount?: string | number
  CurrencyCode?: string
}

/**
 * Parse Amazon Money object to number
 * 
 * @param money - Amazon Money object
 * @returns Parsed amount as number or null
 */
export function parseMoney(money?: AmazonMoney | null): number | null {
  if (!money) return null

  const amount = typeof money.Amount === 'string' ? money.Amount : money.Amount?.toString()
  if (!amount) return null

  const parsed = parseFloat(amount)
  return isNaN(parsed) ? null : parsed
}

/**
 * Get currency code from Money object
 * 
 * @param money - Amazon Money object
 * @returns Currency code or null
 */
export function parseCurrency(money?: AmazonMoney | null): string | null {
  return money?.CurrencyCode || null
}

/**
 * Parse date string to Date object
 * 
 * @param dateString - ISO date string
 * @returns Date object or null
 */
export function parseDate(dateString?: string | null): Date | null {
  if (!dateString) return null

  try {
    const date = new Date(dateString)
    return isNaN(date.getTime()) ? null : date
  } catch {
    return null
  }
}

/**
 * Parse integer from string or number
 * 
 * @param value - String or number value
 * @param defaultValue - Default value if parsing fails
 * @returns Parsed integer or default
 */
export function parseIntSafe(value?: string | number | null, defaultValue: number = 0): number {
  if (value === null || value === undefined) return defaultValue

  if (typeof value === 'number') {
    return Math.floor(value)
  }

  const parsed = parseInt(value, 10)
  return isNaN(parsed) ? defaultValue : parsed
}

/**
 * Parse float from string or number
 * 
 * @param value - String or number value
 * @param defaultValue - Default value if parsing fails
 * @returns Parsed float or default
 */
export function parseFloatSafe(value?: string | number | null, defaultValue: number | null = null): number | null {
  if (value === null || value === undefined) return defaultValue

  if (typeof value === 'number') {
    return value
  }

  const parsed = parseFloat(value)
  return isNaN(parsed) ? defaultValue : parsed
}

/**
 * Normalize string (trim and handle null/undefined)
 * 
 * @param value - String value
 * @returns Normalized string or null
 */
export function normalizeString(value?: string | null): string | null {
  if (!value) return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Normalize SKU (handle various formats)
 * 
 * @param value - SKU value
 * @returns Normalized SKU or null
 */
export function normalizeSKU(value?: string | null): string | null {
  if (!value) return null
  return normalizeString(value)?.toUpperCase() || null
}

/**
 * Normalize ASIN (handle various formats)
 * 
 * @param value - ASIN value
 * @returns Normalized ASIN or null
 */
export function normalizeASIN(value?: string | null): string | null {
  if (!value) return null
  return normalizeString(value)?.toUpperCase() || null
}

/**
 * Extract nested value safely
 * 
 * @param obj - Object to extract from
 * @param path - Dot-separated path (e.g., 'item.price.amount')
 * @param defaultValue - Default value if path doesn't exist
 * @returns Extracted value or default
 */
export function extractNested<T = any>(
  obj: any,
  path: string,
  defaultValue: T | null = null
): T | null {
  if (!obj || !path) return defaultValue

  const keys = path.split('.')
  let current: any = obj

  for (const key of keys) {
    if (current === null || current === undefined) {
      return defaultValue
    }
    current = current[key]
  }

  return current !== undefined && current !== null ? current : defaultValue
}

/**
 * Map array with transformation function
 * 
 * @param array - Array to map
 * @param transform - Transformation function
 * @returns Transformed array
 */
export function mapArray<T, R>(
  array?: T[] | null,
  transform: (item: T) => R
): R[] {
  if (!array || !Array.isArray(array)) return []
  return array.map(transform).filter((item) => item !== null && item !== undefined) as R[]
}

/**
 * Safe array access
 * 
 * @param array - Array to access
 * @param index - Index to access
 * @param defaultValue - Default value if index out of bounds
 * @returns Array element or default
 */
export function safeArrayAccess<T>(
  array?: T[] | null,
  index: number = 0,
  defaultValue: T | null = null
): T | null {
  if (!array || !Array.isArray(array) || index < 0 || index >= array.length) {
    return defaultValue
  }
  return array[index]
}
