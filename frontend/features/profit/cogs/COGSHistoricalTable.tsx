import * as React from 'react'
import { useFetchCOGSHistorical } from './useFetchCOGSHistorical'

export function COGSHistoricalTable(props: { accountId: string; sku?: string; marketplaceId?: string }) {
  const { data, isLoading, error } = useFetchCOGSHistorical({
    accountId: props.accountId,
    sku: props.sku,
    marketplaceId: props.marketplaceId,
    limit: 50,
    offset: 0,
  })

  if (isLoading) return <div>Loading history…</div>
  if (error) return <div>Failed to load history.</div>

  const rows = data?.rows ?? []

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>COGS history</div>
      {rows.length === 0 ? (
        <div style={{ color: '#6b7280' }}>No historical entries.</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb', padding: 6 }}>Date</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb', padding: 6 }}>SKU</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb', padding: 6 }}>Marketplace</th>
              <th style={{ textAlign: 'right', borderBottom: '1px solid #e5e7eb', padding: 6 }}>Qty</th>
              <th style={{ textAlign: 'right', borderBottom: '1px solid #e5e7eb', padding: 6 }}>Unit</th>
              <th style={{ textAlign: 'right', borderBottom: '1px solid #e5e7eb', padding: 6 }}>Total</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb', padding: 6 }}>Method</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={{ padding: 6 }}>{new Date(r.createdAt).toLocaleDateString()}</td>
                <td style={{ padding: 6 }}>{r.sku}</td>
                <td style={{ padding: 6 }}>{r.marketplace?.code ?? r.marketplaceId}</td>
                <td style={{ padding: 6, textAlign: 'right' }}>{r.quantity}</td>
                <td style={{ padding: 6, textAlign: 'right' }}>{Number(r.unitCost).toFixed(2)}</td>
                <td style={{ padding: 6, textAlign: 'right' }}>{Number(r.totalCost).toFixed(2)}</td>
                <td style={{ padding: 6 }}>{r.costMethod}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

