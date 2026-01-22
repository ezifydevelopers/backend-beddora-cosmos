/**
 * Scheduling Rule Types
 * 
 * Defines types for email automation scheduling rules that control
 * when automated emails are sent based on delivery delays and conditions.
 */

export interface SchedulingRuleConditions {
  /** Only send to first-time buyers */
  firstTimeBuyer?: boolean
  /** Only send if order is not returned */
  notReturned?: boolean
  /** Only send if order value is above this amount (in cents) */
  minOrderValue?: number
  /** Only send if order value is below this amount (in cents) */
  maxOrderValue?: number
  /** Only send for specific product categories */
  productCategories?: string[]
  /** Only send for specific SKUs */
  skus?: string[]
  /** Only send if customer has left a review */
  hasReview?: boolean
  /** Only send if customer has not left a review */
  noReview?: boolean
  /** Custom conditions as key-value pairs */
  [key: string]: boolean | number | string[] | undefined
}

export interface SchedulingRuleInput {
  templateId: string
  accountId?: string
  marketplaceId?: string
  productId?: string
  sku?: string
  deliveryDelayDays: number
  conditions?: SchedulingRuleConditions
  isActive?: boolean
}

export interface SchedulingRuleUpdate {
  templateId?: string
  accountId?: string | null
  marketplaceId?: string | null
  productId?: string | null
  sku?: string | null
  deliveryDelayDays?: number
  conditions?: SchedulingRuleConditions | null
  isActive?: boolean
}

export interface SchedulingRuleResponse {
  id: string
  templateId: string
  userId: string
  accountId: string | null
  marketplaceId: string | null
  productId: string | null
  sku: string | null
  deliveryDelayDays: number
  conditions: SchedulingRuleConditions | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
  template?: {
    id: string
    name: string
    subject: string
  }
}

export interface SchedulingPreview {
  ruleId: string
  ruleName: string
  templateName: string
  estimatedSendDate: Date
  conditions: SchedulingRuleConditions | null
  applicableOrders: number
}

