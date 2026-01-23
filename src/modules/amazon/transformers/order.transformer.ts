/**
 * Order Transformers
 * 
 * Utilities for transforming Amazon SP-API Order responses
 */

import {
  parseMoney,
  parseCurrency,
  parseDate,
  parseIntSafe,
  normalizeString,
  normalizeASIN,
  normalizeSKU,
  extractNested,
  AmazonMoney,
} from './common.transformer'

/**
 * Amazon SP-API Order structure
 */
export interface AmazonOrderResponse {
  OrderId?: string
  OrderStatus?: string
  PurchaseDate?: string
  LastUpdateDate?: string
  OrderTotal?: AmazonMoney
  NumberOfItemsShipped?: number
  NumberOfItemsUnshipped?: number
  PaymentMethod?: string
  MarketplaceId?: string
  ShipmentServiceLevelCategory?: string
  OrderType?: string
  EarliestShipDate?: string
  LatestShipDate?: string
  EarliestDeliveryDate?: string
  LatestDeliveryDate?: string
  BuyerInfo?: {
    BuyerEmail?: string
    BuyerName?: string
  }
  ShippingAddress?: any
  OrderItems?: AmazonOrderItemResponse[]
  [key: string]: any
}

/**
 * Amazon SP-API Order Item structure
 */
export interface AmazonOrderItemResponse {
  OrderItemId?: string
  ASIN?: string
  SellerSKU?: string
  Title?: string
  QuantityOrdered?: number
  QuantityShipped?: number
  ItemPrice?: AmazonMoney
  ItemTax?: AmazonMoney
  ShippingPrice?: AmazonMoney
  ShippingTax?: AmazonMoney
  GiftWrapPrice?: AmazonMoney
  GiftWrapTax?: AmazonMoney
  PromotionDiscount?: AmazonMoney
  ShippingPromotionDiscount?: AmazonMoney
  CODFee?: AmazonMoney
  CODFeeDiscount?: AmazonMoney
  ConditionId?: string
  ConditionSubtypeId?: string
  GiftMessageText?: string
  GiftWrapLevel?: string
  IsGift?: boolean
  IsTransparency?: boolean
  ProductInfo?: any
  [key: string]: any
}

/**
 * Transformed order data for database
 */
export interface TransformedOrder {
  orderId: string
  marketplaceId: string
  status: string
  totalAmount: number
  currency: string | null
  purchaseDate: Date | null
  lastUpdateDate: Date | null
  numberOfItemsShipped: number
  numberOfItemsUnshipped: number
  paymentMethod: string | null
  shipmentServiceLevelCategory: string | null
  orderType: string | null
  earliestShipDate: Date | null
  latestShipDate: Date | null
  earliestDeliveryDate: Date | null
  latestDeliveryDate: Date | null
  buyerEmail: string | null
  buyerName: string | null
}

/**
 * Transformed order item data for database
 */
export interface TransformedOrderItem {
  orderItemId: string
  asin: string | null
  sellerSku: string | null
  title: string | null
  quantityOrdered: number
  quantityShipped: number | null
  itemPrice: number | null
  itemTax: number | null
  shippingPrice: number | null
  shippingTax: number | null
  giftWrapPrice: number | null
  giftWrapTax: number | null
  itemPromotionDiscount: number | null
  shippingPromotionDiscount: number | null
  codFee: number | null
  codFeeDiscount: number | null
  currency: string | null
  conditionId: string | null
  conditionSubtypeId: string | null
  giftMessageText: string | null
  giftWrapLevel: string | null
  isGift: boolean
  isTransparency: boolean
  productInfo: Record<string, any> | null
}

/**
 * Transform Amazon Order to internal format
 * 
 * @param order - Amazon SP-API Order response
 * @returns Transformed order data
 */
export function transformOrder(order: AmazonOrderResponse): TransformedOrder {
  const orderTotal = order.OrderTotal || {}
  const buyerInfo = order.BuyerInfo || {}

  return {
    orderId: order.OrderId || '',
    marketplaceId: order.MarketplaceId || '',
    status: order.OrderStatus || 'Unknown',
    totalAmount: parseMoney(order.OrderTotal) || 0,
    currency: parseCurrency(order.OrderTotal),
    purchaseDate: parseDate(order.PurchaseDate),
    lastUpdateDate: parseDate(order.LastUpdateDate),
    numberOfItemsShipped: parseIntSafe(order.NumberOfItemsShipped),
    numberOfItemsUnshipped: parseIntSafe(order.NumberOfItemsUnshipped),
    paymentMethod: normalizeString(order.PaymentMethod),
    shipmentServiceLevelCategory: normalizeString(order.ShipmentServiceLevelCategory),
    orderType: normalizeString(order.OrderType),
    earliestShipDate: parseDate(order.EarliestShipDate),
    latestShipDate: parseDate(order.LatestShipDate),
    earliestDeliveryDate: parseDate(order.EarliestDeliveryDate),
    latestDeliveryDate: parseDate(order.LatestDeliveryDate),
    buyerEmail: normalizeString(buyerInfo.BuyerEmail),
    buyerName: normalizeString(buyerInfo.BuyerName),
  }
}

/**
 * Transform Amazon Order Item to internal format
 * 
 * @param item - Amazon SP-API Order Item response
 * @param orderId - Parent order ID (for generating fallback orderItemId)
 * @returns Transformed order item data
 */
export function transformOrderItem(
  item: AmazonOrderItemResponse,
  orderId: string
): TransformedOrderItem {
  // Generate orderItemId if not provided
  const orderItemId =
    item.OrderItemId ||
    `item-${item.ASIN || item.SellerSKU || Date.now()}`

  // Extract currency from any price field
  const currency =
    parseCurrency(item.ItemPrice) ||
    parseCurrency(item.ShippingPrice) ||
    parseCurrency(item.ItemTax) ||
    null

  // Build product info object
  const productInfo: Record<string, any> = {}
  if (item.ConditionId) productInfo.conditionId = item.ConditionId
  if (item.ConditionSubtypeId) productInfo.conditionSubtypeId = item.ConditionSubtypeId
  if (item.GiftMessageText) productInfo.giftMessageText = item.GiftMessageText
  if (item.GiftWrapLevel) productInfo.giftWrapLevel = item.GiftWrapLevel
  if (item.IsGift !== undefined) productInfo.isGift = item.IsGift
  if (item.IsTransparency !== undefined) productInfo.isTransparency = item.IsTransparency
  if (item.ProductInfo) productInfo.productInfo = item.ProductInfo

  return {
    orderItemId,
    asin: normalizeASIN(item.ASIN),
    sellerSku: normalizeSKU(item.SellerSKU),
    title: normalizeString(item.Title),
    quantityOrdered: parseIntSafe(item.QuantityOrdered, 1),
    quantityShipped: item.QuantityShipped !== undefined ? parseIntSafe(item.QuantityShipped) : null,
    itemPrice: parseMoney(item.ItemPrice),
    itemTax: parseMoney(item.ItemTax),
    shippingPrice: parseMoney(item.ShippingPrice),
    shippingTax: parseMoney(item.ShippingTax),
    giftWrapPrice: parseMoney(item.GiftWrapPrice),
    giftWrapTax: parseMoney(item.GiftWrapTax),
    itemPromotionDiscount: parseMoney(item.PromotionDiscount),
    shippingPromotionDiscount: parseMoney(item.ShippingPromotionDiscount),
    codFee: parseMoney(item.CODFee),
    codFeeDiscount: parseMoney(item.CODFeeDiscount),
    currency,
    conditionId: normalizeString(item.ConditionId),
    conditionSubtypeId: normalizeString(item.ConditionSubtypeId),
    giftMessageText: normalizeString(item.GiftMessageText),
    giftWrapLevel: normalizeString(item.GiftWrapLevel),
    isGift: Boolean(item.IsGift),
    isTransparency: Boolean(item.IsTransparency),
    productInfo: Object.keys(productInfo).length > 0 ? productInfo : null,
  }
}

/**
 * Transform array of order items
 * 
 * @param items - Array of order items
 * @param orderId - Parent order ID
 * @returns Array of transformed order items
 */
export function transformOrderItems(
  items?: AmazonOrderItemResponse[] | null,
  orderId: string = ''
): TransformedOrderItem[] {
  if (!items || !Array.isArray(items)) return []
  return items.map((item) => transformOrderItem(item, orderId))
}

/**
 * Calculate order fees from order items
 * 
 * @param items - Array of order items
 * @returns Calculated fees breakdown
 */
export function calculateOrderFees(items: TransformedOrderItem[]): {
  referral: number
  fba: number
  shipping: number
  giftWrap: number
  promotion: number
  cod: number
  total: number
} {
  let referral = 0
  let fba = 0
  let shipping = 0
  let giftWrap = 0
  let promotion = 0
  let cod = 0

  for (const item of items) {
    // Item price contributes to referral fee calculation
    if (item.itemPrice) {
      referral += item.itemPrice
    }

    // Shipping fees
    if (item.shippingPrice) {
      shipping += item.shippingPrice
    }

    // Gift wrap fees
    if (item.giftWrapPrice) {
      giftWrap += item.giftWrapPrice
    }

    // Promotion discounts
    if (item.itemPromotionDiscount) {
      promotion += item.itemPromotionDiscount
    }
    if (item.shippingPromotionDiscount) {
      promotion += item.shippingPromotionDiscount
    }

    // COD fees
    if (item.codFee) {
      cod += item.codFee
    }
    if (item.codFeeDiscount) {
      cod -= item.codFeeDiscount
    }
  }

  const total = referral + fba + shipping + giftWrap + promotion + cod

  return {
    referral,
    fba,
    shipping,
    giftWrap,
    promotion,
    cod,
    total,
  }
}
