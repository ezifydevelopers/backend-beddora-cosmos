/**
 * Finances API Service
 * 
 * CRITICAL: This API is required for accurate profit calculations.
 * Without Finances API, profit calculations are invalid.
 * 
 * The Finances API provides:
 * - Fee breakdowns (referral fees, FBA fees, etc.)
 * - Settlement data
 * - Reimbursements
 * - Chargebacks
 * - All financial events
 * 
 * Architecture:
 * - Uses SPAPIClient wrapper for authentication
 * - Handles pagination automatically
 * - Parses financial events into structured format
 * - Can be extracted to separate microservice
 */

import { logger } from '../../config/logger'
import { AppError } from '../../middlewares/error.middleware'
import { SPAPIClient } from './sp-api-wrapper.service'

/**
 * Financial Event Types
 */
export enum FinancialEventType {
  ORDER = 'Order',
  REFUND = 'Refund',
  GUARANTEE_CLAIM = 'GuaranteeClaim',
  CHARGEBACK = 'Chargeback',
  PAYOUT = 'Payout',
  ADJUSTMENT = 'Adjustment',
  FEE = 'Fee',
}

/**
 * Financial Event Group
 */
export interface FinancialEventGroup {
  eventGroupId?: string
  financialEventGroupStart?: string
  financialEventGroupEnd?: string
  originalTotal?: {
    currencyCode: string
    currencyAmount: number
  }
  convertedTotal?: {
    currencyCode: string
    currencyAmount: number
  }
  fundTransferEventList?: any[]
  productAdsPaymentEventList?: any[]
  serviceFeeEventList?: any[]
  sellerDealPaymentEventList?: any[]
  debtRecoveryEventList?: any[]
  loanServicingEventList?: any[]
  adjustmentEventList?: any[]
  safetReimbursementEventList?: any[]
  sellerReviewEnrollmentPaymentEventList?: any[]
  fbaLiquidationEventList?: any[]
  couponPaymentEventList?: any[]
  imagingServicesFeeEventList?: any[]
  networkComminglingTransactionEventList?: any[]
  affiliateExpenseEventList?: any[]
  affiliateExpenseReversalEventList?: any[]
  removalShipmentEventList?: any[]
  removalShipmentAdjustmentEventList?: any[]
}

/**
 * Financial Events Response
 */
export interface FinancialEventsResponse {
  payload?: {
    financialEvents?: FinancialEventGroup[]
    nextToken?: string
  }
  errors?: any[]
}

/**
 * Get financial events for a date range
 * 
 * CRITICAL: This is the primary source of fee data for profit calculations.
 * 
 * @param amazonAccountId - Amazon account ID
 * @param postedAfter - Start date (ISO 8601)
 * @param postedBefore - End date (ISO 8601)
 * @param maxResultsPerPage - Max results per page (1-100, default 100)
 * @param nextToken - Pagination token
 * @returns Financial events with pagination
 */
export async function getFinancialEvents(
  amazonAccountId: string,
  postedAfter?: string,
  postedBefore?: string,
  maxResultsPerPage: number = 100,
  nextToken?: string
): Promise<FinancialEventsResponse> {
  try {
    const client = new SPAPIClient(amazonAccountId)

    const params: any = {
      MaxResultsPerPage: Math.min(Math.max(maxResultsPerPage, 1), 100),
    }

    if (postedAfter) {
      params.PostedAfter = postedAfter
    }

    if (postedBefore) {
      params.PostedBefore = postedBefore
    }

    if (nextToken) {
      params.NextToken = nextToken
    }

    const response = await client.get<FinancialEventsResponse>(
      '/finances/v0/financialEvents',
      params
    )

    logger.debug('Retrieved financial events', {
      amazonAccountId,
      eventCount: response.payload?.financialEvents?.length || 0,
      hasNextToken: !!response.payload?.nextToken,
    })

    return response
  } catch (error) {
    logger.error('Failed to retrieve financial events', {
      amazonAccountId,
      error: (error as Error).message,
    })
    throw new AppError('Failed to retrieve financial events from Amazon', 500)
  }
}

/**
 * Get all financial events (handles pagination automatically)
 * 
 * @param amazonAccountId - Amazon account ID
 * @param postedAfter - Start date (ISO 8601)
 * @param postedBefore - End date (ISO 8601)
 * @returns All financial events (paginated results combined)
 */
export async function getAllFinancialEvents(
  amazonAccountId: string,
  postedAfter?: string,
  postedBefore?: string
): Promise<FinancialEventGroup[]> {
  const allEvents: FinancialEventGroup[] = []
  let nextToken: string | undefined

  do {
    const response = await getFinancialEvents(
      amazonAccountId,
      postedAfter,
      postedBefore,
      100,
      nextToken
    )

    if (response.payload?.financialEvents) {
      allEvents.push(...response.payload.financialEvents)
    }

    nextToken = response.payload?.nextToken
  } while (nextToken)

  logger.info('Retrieved all financial events', {
    amazonAccountId,
    totalEventGroups: allEvents.length,
  })

  return allEvents
}

/**
 * Parse fee breakdown from financial events
 * 
 * Extracts fees by type (referral fees, FBA fees, etc.)
 * 
 * @param events - Financial event groups
 * @returns Fee breakdown by type
 */
export function parseFeeBreakdown(events: FinancialEventGroup[]): {
  referralFees: number
  fbaFees: number
  otherFees: number
  totalFees: number
} {
  let referralFees = 0
  let fbaFees = 0
  let otherFees = 0

  for (const eventGroup of events) {
    // Parse service fee events (referral fees, etc.)
    if (eventGroup.serviceFeeEventList) {
      for (const feeEvent of eventGroup.serviceFeeEventList) {
        const amount = feeEvent.feeAmount?.currencyAmount || 0
        const feeType = feeEvent.feeType || ''

        if (feeType.includes('Referral') || feeType.includes('ReferralFee')) {
          referralFees += amount
        } else if (feeType.includes('FBA') || feeType.includes('Fulfillment')) {
          fbaFees += amount
        } else {
          otherFees += amount
        }
      }
    }

    // Parse other fee types
    // Add more parsing logic as needed
  }

  const totalFees = referralFees + fbaFees + otherFees

  return {
    referralFees,
    fbaFees,
    otherFees,
    totalFees,
  }
}
