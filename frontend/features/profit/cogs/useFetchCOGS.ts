import { useFetchCogsBySkuQuery } from './profitCogs.slice'

export function useFetchCOGS(params: { sku: string; accountId: string }) {
  return useFetchCogsBySkuQuery(params)
}

