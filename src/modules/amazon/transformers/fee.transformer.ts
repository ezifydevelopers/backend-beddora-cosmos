/**
 * Fee Transformers
 * 
 * Utilities for transforming Amazon SP-API Financial Events (Fees)
 */

import {
  parseMoney,
  parseCurrency,
  parseDate,
  normalizeString,
  extractNested,
  AmazonMoney,
} from './common.transformer'

/**
 * Amazon SP-API Financial Event structure
 */
export interface AmazonFinancialEvent {
  EventType?: string
  PostedDate?: string
  FeeList?: AmazonFee[]
  ShipmentItemList?: AmazonShipmentItem[]
  ChargeList?: AmazonCharge[]
  [key: string]: any
}

/**
 * Amazon Fee structure
 */
export interface AmazonFee {
  FeeType?: string
  FeeAmount?: AmazonMoney
  FeeDescription?: string
  TaxAmount?: AmazonMoney
  [key: string]: any
}

/**
 * Amazon Charge structure
 */
export interface AmazonCharge {
  ChargeType?: string
  ChargeAmount?: AmazonMoney
  ChargeDescription?: string
  TaxAmount?: AmazonMoney
  [key: string]: any
}

/**
 * Amazon Shipment Item structure
 */
export interface AmazonShipmentItem {
  SellerSKU?: string
  OrderItemId?: string
  OrderAdjustmentItemId?: string
  QuantityShipped?: number
  ItemChargeList?: AmazonCharge[]
  ItemFeeList?: AmazonFee[]
  ItemTaxWithheldList?: any[]
  PromotionList?: any[]
  DirectPaymentList?: any[]
  [key: string]: any
}

/**
 * Transformed fee data
 */
export interface TransformedFee {
  feeType: string
  amount: number | null
  currency: string | null
  description: string | null
  taxAmount: number | null
  postedDate: Date | null
  orderId: string | null
  sku: string | null
  marketplaceId: string | null
}

/**
 * Transform Amazon Fee to internal format
 * 
 * @param fee - Amazon Fee object
 * @param postedDate - Posted date from parent event
 * @param orderId - Associated order ID
 * @param sku - Associated SKU
 * @param marketplaceId - Marketplace ID
 * @returns Transformed fee data
 */
export function transformFee(
  fee: AmazonFee,
  postedDate?: string | null,
  orderId?: string | null,
  sku?: string | null,
  marketplaceId?: string | null
): TransformedFee {
  return {
    feeType: fee.FeeType || 'Unknown',
    amount: parseMoney(fee.FeeAmount),
    currency: parseCurrency(fee.FeeAmount),
    description: normalizeString(fee.FeeDescription),
    taxAmount: parseMoney(fee.TaxAmount),
    postedDate: parseDate(postedDate),
    orderId: orderId || null,
    sku: sku || null,
    marketplaceId: marketplaceId || null,
  }
}

/**
 * Transform Amazon Charge to internal format (as fee)
 * 
 * @param charge - Amazon Charge object
 * @param postedDate - Posted date from parent event
 * @param orderId - Associated order ID
 * @param sku - Associated SKU
 * @param marketplaceId - Marketplace ID
 * @returns Transformed fee data
 */
export function transformCharge(
  charge: AmazonCharge,
  postedDate?: string | null,
  orderId?: string | null,
  sku?: string | null,
  marketplaceId?: string | null
): TransformedFee {
  return {
    feeType: charge.ChargeType || 'Unknown',
    amount: parseMoney(charge.ChargeAmount),
    currency: parseCurrency(charge.ChargeAmount),
    description: normalizeString(charge.ChargeDescription),
    taxAmount: parseMoney(charge.TaxAmount),
    postedDate: parseDate(postedDate),
    orderId: orderId || null,
    sku: sku || null,
    marketplaceId: marketplaceId || null,
  }
}

/**
 * Transform financial event to fee breakdown
 * 
 * @param event - Amazon Financial Event
 * @param orderId - Associated order ID
 * @returns Array of transformed fees
 */
export function transformFinancialEvent(
  event: AmazonFinancialEvent,
  orderId?: string | null
): TransformedFee[] {
  const fees: TransformedFee[] = []
  const postedDate = event.PostedDate

  // Transform fee list
  if (event.FeeList && Array.isArray(event.FeeList)) {
    for (const fee of event.FeeList) {
      fees.push(transformFee(fee, postedDate, orderId))
    }
  }

  // Transform charge list
  if (event.ChargeList && Array.isArray(event.ChargeList)) {
    for (const charge of event.ChargeList) {
      fees.push(transformCharge(charge, postedDate, orderId))
    }
  }

  // Transform shipment item fees
  if (event.ShipmentItemList && Array.isArray(event.ShipmentItemList)) {
    for (const item of event.ShipmentItemList) {
      const sku = item.SellerSKU || null

      // Item fees
      if (item.ItemFeeList && Array.isArray(item.ItemFeeList)) {
        for (const fee of item.ItemFeeList) {
          fees.push(transformFee(fee, postedDate, orderId, sku))
        }
      }

      // Item charges
      if (item.ItemChargeList && Array.isArray(item.ItemChargeList)) {
        for (const charge of item.ItemChargeList) {
          fees.push(transformCharge(charge, postedDate, orderId, sku))
        }
      }
    }
  }

  return fees
}

/**
 * Group fees by type
 * 
 * @param fees - Array of transformed fees
 * @returns Fees grouped by type
 */
export function groupFeesByType(fees: TransformedFee[]): Record<string, TransformedFee[]> {
  const grouped: Record<string, TransformedFee[]> = {}

  for (const fee of fees) {
    const type = fee.feeType || 'Unknown'
    if (!grouped[type]) {
      grouped[type] = []
    }
    grouped[type].push(fee)
  }

  return grouped
}

/**
 * Calculate total fees by type
 * 
 * @param fees - Array of transformed fees
 * @returns Total fees by type
 */
export function calculateFeeTotals(fees: TransformedFee[]): Record<string, number> {
  const totals: Record<string, number> = {}

  for (const fee of fees) {
    const type = fee.feeType || 'Unknown'
    const amount = fee.amount || 0

    if (!totals[type]) {
      totals[type] = 0
    }
    totals[type] += amount
  }

  return totals
}
