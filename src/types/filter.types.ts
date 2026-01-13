/**
 * Filter type definitions for various modules
 */

import { BaseFilter } from './common.types'

/**
 * Date range filter
 */
export interface DateRangeFilter {
  startDate?: Date | string
  endDate?: Date | string
}

/**
 * Product/Inventory filters
 */
export interface ProductFilter extends BaseFilter {
  accountId?: string
  status?: 'active' | 'inactive' | 'discontinued'
  category?: string
  brand?: string
  lowStock?: boolean
}

/**
 * Order filters
 */
export interface OrderFilter extends BaseFilter, DateRangeFilter {
  accountId?: string
  status?: 'pending' | 'shipped' | 'delivered' | 'cancelled'
  minAmount?: number
  maxAmount?: number
}

/**
 * PPC Campaign filters
 */
export interface PPCCampaignFilter extends BaseFilter, DateRangeFilter {
  accountId?: string
  status?: 'enabled' | 'paused' | 'archived'
}

/**
 * Expense filters
 */
export interface ExpenseFilter extends BaseFilter, DateRangeFilter {
  accountId?: string
  type?: 'advertising' | 'shipping' | 'software' | 'other'
  minAmount?: number
  maxAmount?: number
}

/**
 * Alert filters
 */
export interface AlertFilter extends BaseFilter {
  accountId?: string
  type?: string
  status?: 'new' | 'read' | 'resolved'
  severity?: 'low' | 'medium' | 'high'
}

/**
 * Report filters
 */
export interface ReportFilter extends BaseFilter, DateRangeFilter {
  accountId?: string
  type?: 'profit_loss' | 'sales' | 'inventory_summary'
  status?: 'pending' | 'generated' | 'failed'
}

/**
 * Reimbursement filters
 */
export interface ReimbursementFilter extends BaseFilter, DateRangeFilter {
  accountId?: string
  type?: 'lost_inventory' | 'damaged_inventory'
  status?: 'pending' | 'reimbursed' | 'rejected'
}

/**
 * Cashflow filters
 */
export interface CashflowFilter extends BaseFilter, DateRangeFilter {
  accountId?: string
  type?: 'income' | 'expense' | 'transfer'
  category?: string
}

/**
 * Audit log filters
 */
export interface AuditLogFilter extends BaseFilter, DateRangeFilter {
  userId?: string
  accountId?: string
  action?: string
  entityType?: string
}
