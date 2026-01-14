import { Response, NextFunction } from 'express'
import { AuthRequest } from '../../middlewares/auth.middleware'
import * as importService from './import.service'
import { logger } from '../../config/logger'
import multer from 'multer'
import * as path from 'path'
import * as fs from 'fs'

/**
 * Manual Import Controller
 * 
 * Handles HTTP requests for manual data import operations
 * All endpoints require authentication
 */

// Configure multer for file uploads
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedExtensions = ['.csv', '.xlsx', '.xls']
    const ext = path.extname(file.originalname).toLowerCase()

    if (allowedExtensions.includes(ext)) {
      cb(null, true)
    } else {
      cb(new Error(`Invalid file type. Allowed types: ${allowedExtensions.join(', ')}`))
    }
  },
})

/**
 * POST /import/upload
 * Upload and parse CSV/Excel file
 */
export async function uploadFile(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const { amazonAccountId, marketplaceId, importType } = req.body

    if (!amazonAccountId || !marketplaceId || !importType) {
      res.status(400).json({
        error: 'amazonAccountId, marketplaceId, and importType are required',
      })
      return
    }

    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' })
      return
    }

    const result = await importService.uploadFile(
      req.userId,
      amazonAccountId,
      marketplaceId,
      importType as importService.ImportType,
      req.file.path,
      req.file.originalname
    )

    res.status(200).json({
      success: true,
      message: 'File uploaded and parsed successfully',
      data: result,
    })
  } catch (error: any) {
    logger.error('File upload failed', { error, userId: req.userId })
    next(error)
  }
}

/**
 * GET /import/:type/staging
 * Get staging rows for an import type
 */
export async function getStagingRows(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const { type } = req.params
    const { amazonAccountId, status } = req.query

    if (!amazonAccountId) {
      res.status(400).json({ error: 'amazonAccountId is required' })
      return
    }

    const rows = await importService.getStagingRows(
      req.userId,
      amazonAccountId as string,
      type as importService.ImportType,
      status as importService.StagingStatus | undefined
    )

    res.status(200).json({
      success: true,
      data: rows,
    })
  } catch (error: any) {
    logger.error('Failed to get staging rows', { error, userId: req.userId })
    next(error)
  }
}

/**
 * PATCH /import/:type/approve
 * Approve staging rows
 */
export async function approveRows(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const { type } = req.params
    const { amazonAccountId, rowIds } = req.body

    if (!amazonAccountId || !rowIds || !Array.isArray(rowIds)) {
      res.status(400).json({
        error: 'amazonAccountId and rowIds (array) are required',
      })
      return
    }

    const count = await importService.approveRows(
      req.userId,
      amazonAccountId,
      type as importService.ImportType,
      rowIds
    )

    res.status(200).json({
      success: true,
      message: `${count} rows approved`,
      data: { count },
    })
  } catch (error: any) {
    logger.error('Failed to approve rows', { error, userId: req.userId })
    next(error)
  }
}

/**
 * PATCH /import/:type/reject
 * Reject staging rows
 */
export async function rejectRows(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const { type } = req.params
    const { amazonAccountId, rowIds } = req.body

    if (!amazonAccountId || !rowIds || !Array.isArray(rowIds)) {
      res.status(400).json({
        error: 'amazonAccountId and rowIds (array) are required',
      })
      return
    }

    const count = await importService.rejectRows(
      req.userId,
      amazonAccountId,
      type as importService.ImportType,
      rowIds
    )

    res.status(200).json({
      success: true,
      message: `${count} rows rejected`,
      data: { count },
    })
  } catch (error: any) {
    logger.error('Failed to reject rows', { error, userId: req.userId })
    next(error)
  }
}

/**
 * POST /import/:type/finalize
 * Finalize approved rows - commit to production tables
 */
export async function finalizeImport(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const { type } = req.params
    const { amazonAccountId } = req.body

    if (!amazonAccountId) {
      res.status(400).json({ error: 'amazonAccountId is required' })
      return
    }

    const result = await importService.finalizeImport(
      req.userId,
      amazonAccountId,
      type as importService.ImportType
    )

    res.status(200).json({
      success: result.success,
      message: `Import finalized. ${result.recordsImported} records imported.`,
      data: result,
    })
  } catch (error: any) {
    logger.error('Failed to finalize import', { error, userId: req.userId })
    next(error)
  }
}

// Export multer middleware for use in routes
export const uploadMiddleware = upload.single('file')

