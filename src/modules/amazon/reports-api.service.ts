/**
 * Reports API Service
 * 
 * Handles Amazon SP-API Reports operations:
 * - Create report requests
 * - Get report status
 * - Download completed reports
 * 
 * Reports are critical for:
 * - Order history
 * - Inventory data
 * - Financial summaries
 * - Performance metrics
 * 
 * Architecture:
 * - Uses SPAPIClient wrapper for authentication
 * - Handles async report generation
 * - Supports multiple report types
 * - Can be extracted to separate microservice
 */

import { logger } from '../../config/logger'
import { AppError } from '../../middlewares/error.middleware'
import { SPAPIClient } from './sp-api-wrapper.service'

/**
 * Report Types
 */
export enum ReportType {
  GET_FLAT_FILE_ORDERS_DATA = 'GET_FLAT_FILE_ORDERS_DATA',
  GET_MERCHANT_LISTINGS_ALL_DATA = 'GET_MERCHANT_LISTINGS_ALL_DATA',
  GET_FBA_MYI_UNSUPPRESSED_INVENTORY_DATA = 'GET_FBA_MYI_UNSUPPRESSED_INVENTORY_DATA',
  GET_FBA_FULFILLMENT_CUSTOMER_SHIPMENT_SALES_DATA = 'GET_FBA_FULFILLMENT_CUSTOMER_SHIPMENT_SALES_DATA',
  GET_FBA_FULFILLMENT_CUSTOMER_RETURNS_DATA = 'GET_FBA_FULFILLMENT_CUSTOMER_RETURNS_DATA',
  GET_FBA_FULFILLMENT_CUSTOMER_SHIPMENT_PROMOTION_DATA = 'GET_FBA_FULFILLMENT_CUSTOMER_SHIPMENT_PROMOTION_DATA',
  GET_FBA_FULFILLMENT_CUSTOMER_TAXES_DATA = 'GET_FBA_FULFILLMENT_CUSTOMER_TAXES_DATA',
  GET_AFN_INVENTORY_DATA = 'GET_AFN_INVENTORY_DATA',
  GET_AFN_INVENTORY_DATA_BY_COUNTRY = 'GET_AFN_INVENTORY_DATA_BY_COUNTRY',
  GET_LEDGER_SUMMARY_VIEW_DATA = 'GET_LEDGER_SUMMARY_VIEW_DATA',
  GET_LEDGER_DETAIL_VIEW_DATA = 'GET_LEDGER_DETAIL_VIEW_DATA',
}

/**
 * Report Status
 */
export enum ReportStatus {
  CANCELLED = 'CANCELLED',
  DONE = 'DONE',
  FATAL = 'FATAL',
  IN_PROGRESS = 'IN_PROGRESS',
  IN_QUEUE = 'IN_QUEUE',
}

/**
 * Create Report Request
 */
export interface CreateReportRequest {
  reportType: ReportType
  marketplaceIds: string[]
  dataStartTime?: string // ISO 8601
  dataEndTime?: string // ISO 8601
  reportOptions?: Record<string, string>
}

/**
 * Report Response
 */
export interface ReportResponse {
  reportId: string
}

/**
 * Report Status Response
 */
export interface ReportStatusResponse {
  reportId: string
  reportType: string
  processingStatus: ReportStatus
  marketplaceIds?: string[]
  dataStartTime?: string
  dataEndTime?: string
  createdTime?: string
  processingStartTime?: string
  processingEndTime?: string
  reportDocumentId?: string
}

/**
 * Create a report request
 * 
 * @param amazonAccountId - Amazon account ID
 * @param request - Report request parameters
 * @returns Report ID
 */
export async function createReport(
  amazonAccountId: string,
  request: CreateReportRequest
): Promise<string> {
  try {
    const client = new SPAPIClient(amazonAccountId)

    const body: any = {
      reportType: request.reportType,
      marketplaceIds: request.marketplaceIds,
    }

    if (request.dataStartTime) {
      body.dataStartTime = request.dataStartTime
    }

    if (request.dataEndTime) {
      body.dataEndTime = request.dataEndTime
    }

    if (request.reportOptions) {
      body.reportOptions = request.reportOptions
    }

    const response = await client.post<ReportResponse>(
      '/reports/2021-06-30/reports',
      body
    )

    logger.info('Created report request', {
      amazonAccountId,
      reportId: response.reportId,
      reportType: request.reportType,
    })

    return response.reportId
  } catch (error) {
    logger.error('Failed to create report', {
      amazonAccountId,
      error: (error as Error).message,
    })
    throw new AppError('Failed to create report request', 500)
  }
}

/**
 * Get report status
 * 
 * @param amazonAccountId - Amazon account ID
 * @param reportId - Report ID
 * @returns Report status
 */
export async function getReportStatus(
  amazonAccountId: string,
  reportId: string
): Promise<ReportStatusResponse> {
  try {
    const client = new SPAPIClient(amazonAccountId)

    const response = await client.get<ReportStatusResponse>(
      `/reports/2021-06-30/reports/${reportId}`
    )

    logger.debug('Retrieved report status', {
      amazonAccountId,
      reportId,
      status: response.processingStatus,
    })

    return response
  } catch (error) {
    logger.error('Failed to get report status', {
      amazonAccountId,
      reportId,
      error: (error as Error).message,
    })
    throw new AppError('Failed to get report status', 500)
  }
}

/**
 * Get report document
 * 
 * Downloads the completed report document.
 * 
 * @param amazonAccountId - Amazon account ID
 * @param reportDocumentId - Report document ID (from report status)
 * @returns Report document content
 */
export async function getReportDocument(
  amazonAccountId: string,
  reportDocumentId: string
): Promise<string> {
  try {
    const client = new SPAPIClient(amazonAccountId)

    // First, get the document URL
    const documentResponse = await client.get<{
      reportDocumentId: string
      url: string
      compressionAlgorithm?: string
    }>(`/reports/2021-06-30/documents/${reportDocumentId}`)

    // Download the document
    const axios = await import('axios')
    const documentContent = await axios.default.get(documentResponse.url, {
      responseType: 'text',
    })

    logger.info('Downloaded report document', {
      amazonAccountId,
      reportDocumentId,
      size: documentContent.data.length,
    })

    return documentContent.data
  } catch (error) {
    logger.error('Failed to get report document', {
      amazonAccountId,
      reportDocumentId,
      error: (error as Error).message,
    })
    throw new AppError('Failed to download report document', 500)
  }
}

/**
 * Wait for report to complete
 * 
 * Polls report status until it's done or failed.
 * 
 * @param amazonAccountId - Amazon account ID
 * @param reportId - Report ID
 * @param maxWaitTime - Maximum wait time in milliseconds (default: 5 minutes)
 * @param pollInterval - Poll interval in milliseconds (default: 5 seconds)
 * @returns Completed report status
 */
export async function waitForReport(
  amazonAccountId: string,
  reportId: string,
  maxWaitTime: number = 5 * 60 * 1000, // 5 minutes
  pollInterval: number = 5000 // 5 seconds
): Promise<ReportStatusResponse> {
  const startTime = Date.now()

  while (Date.now() - startTime < maxWaitTime) {
    const status = await getReportStatus(amazonAccountId, reportId)

    if (status.processingStatus === ReportStatus.DONE) {
      logger.info('Report completed', {
        amazonAccountId,
        reportId,
        processingTime: Date.now() - startTime,
      })
      return status
    }

    if (status.processingStatus === ReportStatus.FATAL || status.processingStatus === ReportStatus.CANCELLED) {
      throw new AppError(`Report ${reportId} failed with status: ${status.processingStatus}`, 500)
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, pollInterval))
  }

  throw new AppError(`Report ${reportId} did not complete within ${maxWaitTime}ms`, 504)
}
