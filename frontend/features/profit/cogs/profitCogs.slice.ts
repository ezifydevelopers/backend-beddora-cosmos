import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'

export type CostMethod = 'BATCH' | 'TIME_PERIOD' | 'WEIGHTED_AVERAGE'

export interface CogsRow {
  id: string
  accountId: string
  marketplaceId: string
  sku: string
  batchId: string | null
  quantity: number
  unitCost: string | number
  totalCost: string | number
  costMethod: CostMethod
  shipmentCost?: string | number | null
  createdAt: string
  updatedAt: string
  marketplace?: { id: string; name: string; code: string }
  batch?: { id: string; receivedAt: string }
}

export interface CogsHistoryResponse {
  rows: CogsRow[]
  total: number
  limit: number
  offset: number
}

export interface CreateCogsRequest {
  accountId: string
  marketplaceId: string
  sku: string
  quantity: number
  costMethod: CostMethod
  batchId?: string
  unitCost?: number
  shipmentCost?: number
  periodStart?: string
  periodEnd?: string
  asOf?: string
}

export interface UpdateCogsRequest {
  id: string
  accountId: string
  marketplaceId?: string
  quantity?: number
  unitCost?: number
  shipmentCost?: number | null
}

/**
 * Profit COGS API (RTK Query)
 *
 * Assumes the backend is available at NEXT_PUBLIC_API_BASE_URL.
 * In a real app, consider injecting auth headers from state.
 */
export const profitCogsApi = createApi({
  reducerPath: 'profitCogsApi',
  baseQuery: fetchBaseQuery({
    baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL || '',
    prepareHeaders: (headers) => {
      // Example: attach auth token if you store it in cookies/local storage.
      // headers.set('authorization', `Bearer ${token}`)
      return headers
    },
  }),
  tagTypes: ['COGS', 'COGS_HISTORY', 'BATCH'],
  endpoints: (builder) => ({
    fetchCogsBySku: builder.query<CogsRow[], { sku: string; accountId: string }>({
      query: ({ sku, accountId }) => ({
        url: `/cogs/${encodeURIComponent(sku)}`,
        params: { accountId },
      }),
      providesTags: (result) =>
        result
          ? [
              ...result.map((r) => ({ type: 'COGS' as const, id: r.id })),
              { type: 'COGS' as const, id: 'LIST' },
            ]
          : [{ type: 'COGS' as const, id: 'LIST' }],
    }),

    addCogs: builder.mutation<CogsRow, CreateCogsRequest>({
      query: (body) => ({
        url: '/cogs',
        method: 'POST',
        body,
      }),
      invalidatesTags: [{ type: 'COGS', id: 'LIST' }, { type: 'COGS_HISTORY', id: 'LIST' }],
    }),

    updateCogs: builder.mutation<CogsRow, UpdateCogsRequest>({
      query: ({ id, accountId, ...patch }) => ({
        url: `/cogs/${id}`,
        method: 'PATCH',
        params: { accountId },
        body: patch,
      }),
      invalidatesTags: (result) =>
        result
          ? [
              { type: 'COGS', id: result.id },
              { type: 'COGS', id: 'LIST' },
              { type: 'COGS_HISTORY', id: 'LIST' },
            ]
          : [{ type: 'COGS', id: 'LIST' }, { type: 'COGS_HISTORY', id: 'LIST' }],
    }),

    fetchCogsHistory: builder.query<
      CogsHistoryResponse,
      { accountId: string; sku?: string; marketplaceId?: string; startDate?: string; endDate?: string; costMethod?: CostMethod; limit?: number; offset?: number }
    >({
      query: (params) => ({
        url: '/cogs/history',
        params,
      }),
      providesTags: [{ type: 'COGS_HISTORY', id: 'LIST' }],
    }),
  }),
})

export const {
  useFetchCogsBySkuQuery,
  useAddCogsMutation,
  useUpdateCogsMutation,
  useFetchCogsHistoryQuery,
} = profitCogsApi

