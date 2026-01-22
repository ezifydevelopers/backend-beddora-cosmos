export type ExpenseType = 'fixed' | 'recurring' | 'one-time'

export interface AllocatedProduct {
  sku: string
  percentage: number
}

export interface ExpenseFilters {
  accountId?: string
  marketplaceId?: string
  type?: ExpenseType
  category?: string
  sku?: string
  startDate?: string
  endDate?: string
}

export interface ExpenseInput {
  accountId: string
  marketplaceId?: string
  type: ExpenseType
  category: string
  amount: number
  currency: string
  allocatedProducts?: AllocatedProduct[]
  description?: string
  incurredAt: string
}

export interface ExpenseUpdateInput {
  marketplaceId?: string
  type?: ExpenseType
  category?: string
  amount?: number
  currency?: string
  allocatedProducts?: AllocatedProduct[]
  description?: string
  incurredAt?: string
}

export interface ExpenseSummary {
  totalAmount: number
  byType: Record<ExpenseType, number>
  byCategory: Record<string, number>
  count: number
}

export interface ExpensesListResponse {
  expenses: Array<{
    id: string
    accountId: string
    marketplaceId: string | null
    type: ExpenseType
    category: string
    amount: number
    currency: string
    allocatedProducts: AllocatedProduct[] | null
    description: string | null
    incurredAt: string
    createdAt: string
    updatedAt: string
  }>
  summary: ExpenseSummary
  totalRecords: number
}

export interface BulkImportResult {
  created: number
  failed: number
  errors: Array<{ row: number; message: string }>
}

