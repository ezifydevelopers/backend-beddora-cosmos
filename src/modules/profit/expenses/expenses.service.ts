import prisma from '../../../config/db'
import { AppError } from '../../../middlewares/error.middleware'
import { logger } from '../../../config/logger'
import {
  AllocatedProduct,
  ExpenseFilters,
  ExpenseInput,
  ExpenseSummary,
  ExpenseType,
  ExpenseUpdateInput,
  ExpensesListResponse,
  BulkImportResult,
} from '../../../types/expenses.types'
import fs from 'fs'
import path from 'path'
import { parse as parseCsv } from 'csv-parse/sync'
import xlsx from 'xlsx'

/**
 * Expenses Service
 * Handles all business logic for expense management
 */

async function verifyAccountAccess(userId: string, accountId: string): Promise<void> {
  const userAccount = await prisma.userAccount.findFirst({
    where: {
      userId,
      accountId,
      isActive: true,
    },
  })

  if (!userAccount) {
    throw new AppError('Account not found or access denied', 403)
  }
}

function buildDateFilter(startDate?: string, endDate?: string) {
  const filter: { gte?: Date; lte?: Date } = {}
  if (startDate) filter.gte = new Date(startDate)
  if (endDate) filter.lte = new Date(endDate)
  return Object.keys(filter).length > 0 ? filter : undefined
}

function normalizeAllocatedProducts(value?: AllocatedProduct[] | null): AllocatedProduct[] | null {
  if (!value || value.length === 0) return null

  const cleaned = value
    .map((entry) => ({
      sku: entry.sku?.trim(),
      percentage: Number(entry.percentage),
    }))
    .filter((entry) => entry.sku && entry.percentage > 0)

  if (cleaned.length === 0) return null

  const total = cleaned.reduce((sum, entry) => sum + entry.percentage, 0)
  if (total > 100.01) {
    throw new AppError('Allocated product percentages cannot exceed 100', 400)
  }

  return cleaned
}

function parseAllocatedProductsFromString(value?: string): AllocatedProduct[] | null {
  if (!value) return null

  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) {
      return normalizeAllocatedProducts(parsed as AllocatedProduct[])
    }
  } catch {
    // Fall through to custom parsing
  }

  // Format: SKU1:50,SKU2:50
  const entries = value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [sku, pct] = part.split(':')
      return {
        sku: sku?.trim(),
        percentage: Number(pct),
      }
    })
    .filter((entry) => entry.sku && entry.percentage > 0)

  return normalizeAllocatedProducts(entries)
}

function getAllocatedAmountForSku(amount: number, allocations: AllocatedProduct[] | null, sku?: string): number {
  if (!sku || !allocations || allocations.length === 0) return amount

  const match = allocations.find((entry) => entry.sku === sku)
  if (!match) return 0

  return amount * (match.percentage / 100)
}

function summarizeExpenses(expenses: ExpensesListResponse['expenses'], sku?: string): ExpenseSummary {
  const summary: ExpenseSummary = {
    totalAmount: 0,
    byType: {
      fixed: 0,
      recurring: 0,
      'one-time': 0,
    },
    byCategory: {},
    count: expenses.length,
  }

  for (const expense of expenses) {
    const amount = getAllocatedAmountForSku(
      expense.amount,
      expense.allocatedProducts || null,
      sku
    )

    if (amount === 0) continue

    summary.totalAmount += amount
    summary.byType[expense.type] += amount
    summary.byCategory[expense.category] = (summary.byCategory[expense.category] || 0) + amount
  }

  summary.totalAmount = Number(summary.totalAmount.toFixed(2))
  summary.byType.fixed = Number(summary.byType.fixed.toFixed(2))
  summary.byType.recurring = Number(summary.byType.recurring.toFixed(2))
  summary.byType['one-time'] = Number(summary.byType['one-time'].toFixed(2))

  Object.keys(summary.byCategory).forEach((key) => {
    summary.byCategory[key] = Number(summary.byCategory[key].toFixed(2))
  })

  return summary
}

export async function getExpenses(userId: string, filters: ExpenseFilters): Promise<ExpensesListResponse> {
  const { accountId, marketplaceId, type, category, sku, startDate, endDate } = filters

  if (!accountId) {
    throw new AppError('accountId is required', 400)
  }

  await verifyAccountAccess(userId, accountId)

  const dateFilter = buildDateFilter(startDate, endDate)

  const where: any = {
    accountId,
  }

  if (marketplaceId) where.marketplaceId = marketplaceId
  if (type) where.type = type
  if (category) where.category = category
  if (dateFilter) where.incurredAt = dateFilter

  const expenses = await prisma.expense.findMany({
    where,
    orderBy: { incurredAt: 'desc' },
  })

  const serialized = expenses.map((expense) => ({
    id: expense.id,
    accountId: expense.accountId,
    marketplaceId: expense.marketplaceId,
    type: expense.type as ExpenseType,
    category: expense.category,
    amount: Number(expense.amount),
    currency: expense.currency,
    allocatedProducts: (expense.allocatedProducts as AllocatedProduct[] | null) || null,
    description: expense.description,
    incurredAt: expense.incurredAt.toISOString(),
    createdAt: expense.createdAt.toISOString(),
    updatedAt: expense.updatedAt.toISOString(),
  }))

  const filtered = sku
    ? serialized.filter((expense) =>
        (expense.allocatedProducts || []).some((entry) => entry.sku === sku)
      )
    : serialized

  return {
    expenses: filtered,
    summary: summarizeExpenses(filtered, sku),
    totalRecords: filtered.length,
  }
}

export async function createExpense(userId: string, data: ExpenseInput) {
  await verifyAccountAccess(userId, data.accountId)

  const allocatedProducts = normalizeAllocatedProducts(data.allocatedProducts)

  const created = await prisma.expense.create({
    data: {
      accountId: data.accountId,
      marketplaceId: data.marketplaceId || null,
      type: data.type,
      category: data.category,
      amount: data.amount,
      currency: data.currency,
      allocatedProducts,
      description: data.description,
      incurredAt: new Date(data.incurredAt),
    },
  })

  return {
    success: true,
    data: created,
  }
}

export async function updateExpense(userId: string, expenseId: string, data: ExpenseUpdateInput) {
  const existing = await prisma.expense.findUnique({
    where: { id: expenseId },
  })

  if (!existing) {
    throw new AppError('Expense not found', 404)
  }

  await verifyAccountAccess(userId, existing.accountId)

  const allocatedProducts = data.allocatedProducts
    ? normalizeAllocatedProducts(data.allocatedProducts)
    : undefined

  const updated = await prisma.expense.update({
    where: { id: expenseId },
    data: {
      marketplaceId: data.marketplaceId,
      type: data.type,
      category: data.category,
      amount: data.amount,
      currency: data.currency,
      allocatedProducts,
      description: data.description,
      incurredAt: data.incurredAt ? new Date(data.incurredAt) : undefined,
    },
  })

  return {
    success: true,
    data: updated,
  }
}

export async function deleteExpense(userId: string, expenseId: string) {
  const existing = await prisma.expense.findUnique({
    where: { id: expenseId },
  })

  if (!existing) {
    throw new AppError('Expense not found', 404)
  }

  await verifyAccountAccess(userId, existing.accountId)

  await prisma.expense.delete({
    where: { id: expenseId },
  })

  return {
    success: true,
    message: 'Expense deleted successfully',
  }
}

export async function bulkImportExpenses(
  userId: string,
  filePath: string,
  originalName: string,
  accountId?: string
): Promise<BulkImportResult> {
  if (!accountId) {
    throw new AppError('accountId is required for bulk import', 400)
  }

  await verifyAccountAccess(userId, accountId)

  const ext = path.extname(originalName).toLowerCase()
  const rows: Record<string, any>[] = []

  try {
    if (ext === '.csv') {
      const csvContent = fs.readFileSync(filePath, 'utf-8')
      const records = parseCsv(csvContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      })
      rows.push(...records)
    } else if (ext === '.xlsx' || ext === '.xls') {
      const workbook = xlsx.readFile(filePath)
      const sheetName = workbook.SheetNames[0]
      const sheet = workbook.Sheets[sheetName]
      const records = xlsx.utils.sheet_to_json(sheet, { defval: '' })
      rows.push(...records)
    } else {
      throw new AppError('Unsupported file type for bulk import', 400)
    }
  } finally {
    fs.unlink(filePath, () => undefined)
  }

  let created = 0
  let failed = 0
  const errors: BulkImportResult['errors'] = []

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]

    try {
      const rawType = String(row.type || row.Type || '').toLowerCase().trim()
      const normalizedType =
        rawType === 'one time' || rawType === 'one_time' ? 'one-time' : rawType
      const type = normalizedType as ExpenseType
      const category = String(row.category || row.Category || '').trim()
      const amount = Number(row.amount || row.Amount || 0)
      const currency = String(row.currency || row.Currency || 'USD').trim()
      const description = String(row.description || row.Description || '').trim() || undefined
      const incurredAtValue = String(row.incurredAt || row.IncurredAt || row.date || row.Date || '').trim()
      const marketplaceId = String(row.marketplaceId || row.MarketplaceId || '').trim() || undefined
      const allocatedProductsRaw = String(row.allocatedProducts || row.AllocatedProducts || '').trim()

      if (!category || !type || !amount || !incurredAtValue) {
        throw new AppError('Missing required fields (type, category, amount, incurredAt)', 400)
      }

      if (!['fixed', 'recurring', 'one-time'].includes(type)) {
        throw new AppError('Invalid expense type', 400)
      }

      const allocatedProducts = parseAllocatedProductsFromString(allocatedProductsRaw)

      await prisma.expense.create({
        data: {
          accountId,
          marketplaceId: marketplaceId || null,
          type,
          category,
          amount,
          currency,
          allocatedProducts,
          description,
          incurredAt: new Date(incurredAtValue),
        },
      })

      created += 1
    } catch (error: any) {
      failed += 1
      errors.push({
        row: index + 1,
        message: error.message || 'Failed to import row',
      })
    }
  }

  if (failed > 0) {
    logger.warn('Bulk expense import completed with errors', { failed, created })
  }

  return { created, failed, errors }
}

