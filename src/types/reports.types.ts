export type ReportType = 'profit' | 'inventory' | 'ppc' | 'returns'
export type ReportFormat = 'csv' | 'excel' | 'pdf'
export type ReportSchedule = 'daily' | 'weekly' | 'monthly'

export interface ReportFilters {
  accountId: string
  amazonAccountId?: string
  marketplaceId?: string
  sku?: string
  campaignId?: string
  startDate?: string
  endDate?: string
  metrics?: string[]
}

export interface ExportReportRequest {
  reportType: ReportType
  format: ReportFormat
  filters: ReportFilters
}

export interface ScheduleReportRequest {
  accountId: string
  reportType: ReportType
  schedule: ReportSchedule
  filters: ReportFilters
  emailRecipients: string[]
}

export interface UpdateScheduleRequest {
  reportType?: ReportType
  schedule?: ReportSchedule
  filters?: ReportFilters
  emailRecipients?: string[]
}

