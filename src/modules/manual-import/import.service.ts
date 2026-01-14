import prisma from '../../config/db'
import { AppError } from '../../middlewares/error.middleware'
import { logger } from '../../config/logger'
import * as fs from 'fs'
import * as path from 'path'
// Note: Install required packages: npm install csv-parse xlsx multer @types/multer
import { parse } from 'csv-parse/sync'
import * as XLSX from 'xlsx'

/**
 * Manual Import Service
 * 
 * Production-ready service for manual data import via CSV/Excel files
 * Features:
 * - CSV and Excel file parsing
 * - Data validation per import type
 * - Staging table management
 * - Approve/reject workflow
 * - Finalize to production tables
 */

// ============================================
// TYPES
// ============================================

export type ImportType = 'orders' | 'fees' | 'ppc' | 'inventory' | 'listings' | 'refunds'

export type StagingStatus = 'pending' | 'approved' | 'rejected' | 'finalized'

export interface ParsedRow {
  [key: string]: any
}

export interface ValidationError {
  field: string
  message: string
  value?: any
}

export interface ImportResult {
  success: boolean
  totalRows: number
  validRows: number
  invalidRows: number
  stagingIds: string[]
  errors?: ValidationError[]
}

// ============================================
// FILE PARSING
// ============================================

/**
 * Parse CSV file
 */
function parseCSVFile(filePath: string): ParsedRow[] {
  try {
    const fileContent = fs.readFileSync(filePath, 'utf-8')
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      cast: true,
    })

    return records as ParsedRow[]
  } catch (error: any) {
    logger.error('Failed to parse CSV file', { error, filePath })
    throw new AppError(`Failed to parse CSV file: ${error.message}`, 400)
  }
}

/**
 * Parse Excel file
 */
function parseExcelFile(filePath: string): ParsedRow[] {
  try {
    const workbook = XLSX.readFile(filePath)
    const sheetName = workbook.SheetNames[0] // Use first sheet
    const worksheet = workbook.Sheets[sheetName]
    const records = XLSX.utils.sheet_to_json(worksheet, {
      raw: false,
      defval: '',
    })

    return records as ParsedRow[]
  } catch (error: any) {
    logger.error('Failed to parse Excel file', { error, filePath })
    throw new AppError(`Failed to parse Excel file: ${error.message}`, 400)
  }
}

/**
 * Parse uploaded file based on extension
 */
export function parseFile(filePath: string, fileName: string): ParsedRow[] {
  const ext = path.extname(fileName).toLowerCase()

  switch (ext) {
    case '.csv':
      return parseCSVFile(filePath)
    case '.xlsx':
    case '.xls':
      return parseExcelFile(filePath)
    default:
      throw new AppError(`Unsupported file type: ${ext}. Supported types: .csv, .xlsx, .xls`, 400)
  }
}

// ============================================
// VALIDATION
// ============================================

/**
 * Required fields for each import type
 */
const REQUIRED_FIELDS: Record<ImportType, string[]> = {
  orders: ['orderId', 'status', 'totalAmount'],
  fees: ['orderId', 'feeType', 'amount'],
  ppc: ['campaignId', 'date', 'clicks', 'spend'],
  inventory: ['sku', 'stockLevel'],
  listings: ['sku'],
  refunds: ['orderId', 'refundId', 'amount'],
}

/**
 * Validate row data based on import type
 */
function validateRow(row: ParsedRow, importType: ImportType): ValidationError[] {
  const errors: ValidationError[] = []
  const requiredFields = REQUIRED_FIELDS[importType]

  // Check required fields
  for (const field of requiredFields) {
    if (!row[field] || (typeof row[field] === 'string' && row[field].trim() === '')) {
      errors.push({
        field,
        message: `${field} is required`,
        value: row[field],
      })
    }
  }

  // Type-specific validation
  switch (importType) {
    case 'orders':
      if (row.totalAmount && isNaN(parseFloat(row.totalAmount))) {
        errors.push({
          field: 'totalAmount',
          message: 'totalAmount must be a valid number',
          value: row.totalAmount,
        })
      }
      break

    case 'fees':
      if (row.amount && isNaN(parseFloat(row.amount))) {
        errors.push({
          field: 'amount',
          message: 'amount must be a valid number',
          value: row.amount,
        })
      }
      if (row.feeType && !['referral', 'fba', 'storage', 'removal', 'disposal'].includes(row.feeType.toLowerCase())) {
        errors.push({
          field: 'feeType',
          message: 'feeType must be one of: referral, fba, storage, removal, disposal',
          value: row.feeType,
        })
      }
      break

    case 'ppc':
      if (row.clicks && isNaN(parseInt(row.clicks))) {
        errors.push({
          field: 'clicks',
          message: 'clicks must be a valid integer',
          value: row.clicks,
        })
      }
      if (row.spend && isNaN(parseFloat(row.spend))) {
        errors.push({
          field: 'spend',
          message: 'spend must be a valid number',
          value: row.spend,
        })
      }
      if (row.date && isNaN(Date.parse(row.date))) {
        errors.push({
          field: 'date',
          message: 'date must be a valid date',
          value: row.date,
        })
      }
      break

    case 'inventory':
      if (row.stockLevel && isNaN(parseInt(row.stockLevel))) {
        errors.push({
          field: 'stockLevel',
          message: 'stockLevel must be a valid integer',
          value: row.stockLevel,
        })
      }
      if (row.inboundQty && isNaN(parseInt(row.inboundQty))) {
        errors.push({
          field: 'inboundQty',
          message: 'inboundQty must be a valid integer',
          value: row.inboundQty,
        })
      }
      break

    case 'refunds':
      if (row.amount && isNaN(parseFloat(row.amount))) {
        errors.push({
          field: 'amount',
          message: 'amount must be a valid number',
          value: row.amount,
        })
      }
      break
  }

  return errors
}

// ============================================
// STAGING TABLE OPERATIONS
// ============================================

/**
 * Get staging table model based on import type
 */
function getStagingModel(importType: ImportType) {
  switch (importType) {
    case 'orders':
      return prisma.orderImportStaging
    case 'ppc':
      return prisma.pPCImportStaging
    case 'inventory':
      return prisma.inventoryImportStaging
    case 'listings':
      return prisma.listingImportStaging
    case 'refunds':
      return prisma.refundImportStaging
    default:
      throw new AppError(`Invalid import type: ${importType}`, 400)
  }
}

/**
 * Upload and parse file, store in staging table
 */
export async function uploadFile(
  userId: string,
  amazonAccountId: string,
  marketplaceId: string,
  importType: ImportType,
  filePath: string,
  fileName: string
): Promise<ImportResult> {
  try {
    // Verify user owns the account
    const account = await prisma.amazonAccount.findUnique({
      where: { id: amazonAccountId },
    })

    if (!account || account.userId !== userId) {
      throw new AppError('Access denied', 403)
    }

    // Parse file
    const rows = parseFile(filePath, fileName)
    const totalRows = rows.length

    if (totalRows === 0) {
      throw new AppError('File is empty or contains no valid data', 400)
    }

    // Validate and store in staging
    const stagingModel = getStagingModel(importType)
    const stagingIds: string[] = []
    let validRows = 0
    let invalidRows = 0

    for (const row of rows) {
      const errors = validateRow(row, importType)
      const isValid = errors.length === 0

      const stagingRecord = await stagingModel.create({
        data: {
          userId,
          amazonAccountId,
          marketplaceId,
          rawData: row,
          validated: isValid,
          errorMessages: errors.length > 0 ? errors : null,
          status: 'pending',
        },
      })

      stagingIds.push(stagingRecord.id)

      if (isValid) {
        validRows++
      } else {
        invalidRows++
      }
    }

    // Clean up uploaded file
    try {
      fs.unlinkSync(filePath)
    } catch (error) {
      logger.warn('Failed to delete uploaded file', { filePath, error })
    }

    logger.info('File uploaded and parsed', {
      userId,
      amazonAccountId,
      importType,
      totalRows,
      validRows,
      invalidRows,
    })

    return {
      success: true,
      totalRows,
      validRows,
      invalidRows,
      stagingIds,
    }
  } catch (error: any) {
    logger.error('File upload failed', { userId, amazonAccountId, importType, error })

    // Clean up file on error
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
      }
    } catch (cleanupError) {
      logger.warn('Failed to cleanup file on error', { filePath, cleanupError })
    }

    throw error instanceof AppError ? error : new AppError(`Upload failed: ${error.message}`, 500)
  }
}

/**
 * Get staging rows for an import type
 */
export async function getStagingRows(
  userId: string,
  amazonAccountId: string,
  importType: ImportType,
  status?: StagingStatus
) {
  // Verify ownership
  const account = await prisma.amazonAccount.findUnique({
    where: { id: amazonAccountId },
  })

  if (!account || account.userId !== userId) {
    throw new AppError('Access denied', 403)
  }

  const stagingModel = getStagingModel(importType)
  const where: any = {
    userId,
    amazonAccountId,
  }

  if (status) {
    where.status = status
  }

  const rows = await stagingModel.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  })

  return rows
}

/**
 * Approve staging rows
 */
export async function approveRows(
  userId: string,
  amazonAccountId: string,
  importType: ImportType,
  rowIds: string[]
): Promise<number> {
  // Verify ownership
  const account = await prisma.amazonAccount.findUnique({
    where: { id: amazonAccountId },
  })

  if (!account || account.userId !== userId) {
    throw new AppError('Access denied', 403)
  }

  const stagingModel = getStagingModel(importType)

  const result = await stagingModel.updateMany({
    where: {
      id: { in: rowIds },
      userId,
      amazonAccountId,
      status: 'pending',
    },
    data: {
      status: 'approved',
      updatedAt: new Date(),
    },
  })

  logger.info('Rows approved', { userId, amazonAccountId, importType, count: result.count })

  return result.count
}

/**
 * Reject staging rows
 */
export async function rejectRows(
  userId: string,
  amazonAccountId: string,
  importType: ImportType,
  rowIds: string[]
): Promise<number> {
  // Verify ownership
  const account = await prisma.amazonAccount.findUnique({
    where: { id: amazonAccountId },
  })

  if (!account || account.userId !== userId) {
    throw new AppError('Access denied', 403)
  }

  const stagingModel = getStagingModel(importType)

  const result = await stagingModel.updateMany({
    where: {
      id: { in: rowIds },
      userId,
      amazonAccountId,
      status: 'pending',
    },
    data: {
      status: 'rejected',
      updatedAt: new Date(),
    },
  })

  logger.info('Rows rejected', { userId, amazonAccountId, importType, count: result.count })

  return result.count
}

/**
 * Finalize approved rows - move to production tables
 */
export async function finalizeImport(
  userId: string,
  amazonAccountId: string,
  importType: ImportType
): Promise<{ success: boolean; recordsImported: number; errors: string[] }> {
  // Verify ownership
  const account = await prisma.amazonAccount.findUnique({
    where: { id: amazonAccountId },
  })

  if (!account || account.userId !== userId) {
    throw new AppError('Access denied', 403)
  }

  const stagingModel = getStagingModel(importType)

  // Get all approved rows
  const approvedRows = await stagingModel.findMany({
    where: {
      userId,
      amazonAccountId,
      status: 'approved',
    },
  })

  if (approvedRows.length === 0) {
    return {
      success: true,
      recordsImported: 0,
      errors: [],
    }
  }

  const errors: string[] = []
  let recordsImported = 0

  // Process each row based on import type
  for (const row of approvedRows) {
    try {
      const rawData = row.rawData as any

      switch (importType) {
        case 'orders':
          await prisma.amazonOrder.upsert({
            where: { orderId: rawData.orderId },
            update: {
              status: rawData.status,
              totalAmount: parseFloat(rawData.totalAmount || '0'),
              fees: rawData.fees || {},
              updatedAt: new Date(),
            },
            create: {
              orderId: rawData.orderId,
              marketplaceId: row.marketplaceId,
              amazonAccountId,
              status: rawData.status,
              totalAmount: parseFloat(rawData.totalAmount || '0'),
              fees: rawData.fees || {},
            },
          })
          break

        case 'ppc':
          await prisma.pPCMetric.create({
            data: {
              campaignId: rawData.campaignId,
              adGroupId: rawData.adGroupId || null,
              keywordId: rawData.keywordId || null,
              clicks: parseInt(rawData.clicks || '0'),
              spend: parseFloat(rawData.spend || '0'),
              sales: parseFloat(rawData.sales || '0'),
              acos: rawData.acos ? parseFloat(rawData.acos) : null,
              amazonAccountId,
              marketplaceId: row.marketplaceId,
              date: rawData.date ? new Date(rawData.date) : new Date(),
            },
          })
          break

        case 'inventory':
          await prisma.amazonInventory.upsert({
            where: {
              amazonAccountId_sku_marketplaceId: {
                amazonAccountId,
                sku: rawData.sku,
                marketplaceId: row.marketplaceId,
              },
            },
            update: {
              stockLevel: parseInt(rawData.stockLevel || '0'),
              inboundQty: parseInt(rawData.inboundQty || '0'),
              updatedAt: new Date(),
            },
            create: {
              sku: rawData.sku,
              marketplaceId: row.marketplaceId,
              amazonAccountId,
              stockLevel: parseInt(rawData.stockLevel || '0'),
              inboundQty: parseInt(rawData.inboundQty || '0'),
            },
          })
          break

        case 'listings':
          await prisma.listingChange.create({
            data: {
              sku: rawData.sku,
              marketplaceId: row.marketplaceId,
              amazonAccountId,
              changes: rawData,
              detectedAt: new Date(),
            },
          })
          break

        case 'refunds':
          await prisma.amazonRefund.upsert({
            where: { refundId: rawData.refundId },
            update: {
              amount: parseFloat(rawData.amount || '0'),
              reasonCode: rawData.reasonCode || null,
              processedAt: rawData.processedAt ? new Date(rawData.processedAt) : null,
              updatedAt: new Date(),
            },
            create: {
              orderId: rawData.orderId,
              refundId: rawData.refundId,
              amount: parseFloat(rawData.amount || '0'),
              reasonCode: rawData.reasonCode || null,
              accountId: amazonAccountId,
              marketplaceId: row.marketplaceId,
              processedAt: rawData.processedAt ? new Date(rawData.processedAt) : null,
            },
          })
          break
      }

      // Mark as finalized
      await stagingModel.update({
        where: { id: row.id },
        data: { status: 'finalized', updatedAt: new Date() },
      })

      recordsImported++
    } catch (error: any) {
      errors.push(`Row ${row.id}: ${error.message}`)
      logger.error('Failed to import row', { rowId: row.id, importType, error })
    }
  }

  logger.info('Import finalized', {
    userId,
    amazonAccountId,
    importType,
    recordsImported,
    errors: errors.length,
  })

  return {
    success: errors.length === 0,
    recordsImported,
    errors,
  }
}

