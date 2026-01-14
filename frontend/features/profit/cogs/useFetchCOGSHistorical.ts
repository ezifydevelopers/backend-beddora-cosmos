import { useFetchCogsHistoryQuery } from './profitCogs.slice'

export function useFetchCOGSHistorical(params: {
  accountId: string
  sku?: string
  marketplaceId?: string
  startDate?: string
  endDate?: string
  costMethod?: 'BATCH' | 'TIME_PERIOD' | 'WEIGHTED_AVERAGE'
  limit?: number
  offset?: number
}) {
  return useFetchCogsHistoryQuery(params)
}

