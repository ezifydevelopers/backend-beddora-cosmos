/**
 * Reimbursement Case Types
 *
 * Defines types for reimbursement case generation and tracking.
 */

export type CaseType = 'lost' | 'damaged' | 'refund_discrepancy'
export type CaseSubmissionStatus = 'draft' | 'submitted' | 'resolved'

export interface ReimbursementCase {
  id: string
  userId: string
  accountId: string | null
  marketplaceId: string
  productId: string | null
  sku: string | null
  caseType: CaseType
  generatedText: string
  submissionStatus: CaseSubmissionStatus
  submissionDate: Date | null
  resolutionDate: Date | null
  createdAt: Date
  updatedAt: Date
  marketplace?: {
    id: string
    name: string
  }
  product?: {
    id: string
    title: string
    sku: string
  }
}

export interface ReimbursementCaseInput {
  caseType: CaseType
  marketplaceId: string
  productId?: string
  sku?: string
  sourceId?: string // FBA inventory alert or refund discrepancy id
  customNotes?: string
}

export interface ReimbursementCaseUpdate {
  generatedText?: string
  submissionStatus?: CaseSubmissionStatus
  submissionDate?: Date | null
  resolutionDate?: Date | null
  notes?: string
}

export interface ReimbursementCaseFilters {
  accountId?: string
  marketplaceId?: string
  productId?: string
  sku?: string
  caseType?: CaseType
  submissionStatus?: CaseSubmissionStatus
  startDate?: Date
  endDate?: Date
}

export interface CaseHistoryEntry {
  id: string
  caseId: string
  userId: string
  previousText: string | null
  newText: string | null
  previousStatus: string | null
  newStatus: string | null
  notes: string | null
  changedAt: Date
}

