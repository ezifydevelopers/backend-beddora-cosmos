import * as React from 'react'
import { useFetchCOGS } from './useFetchCOGS'

export function COGSCard(props: { sku: string; accountId: string }) {
  const { data, isLoading, error } = useFetchCOGS({ sku: props.sku, accountId: props.accountId })

  if (isLoading) return <div>Loading COGS…</div>
  if (error) return <div>Failed to load COGS.</div>

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>COGS for {props.sku}</div>
      {!data || data.length === 0 ? (
        <div style={{ color: '#6b7280' }}>No COGS snapshots found.</div>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {data.map((row) => {
            const effectiveUnitCost =
              row.quantity > 0 ? Number(row.totalCost) / Number(row.quantity) : 0
            return (
              <li key={row.id}>
                <strong>{row.marketplace?.code ?? row.marketplaceId}</strong>: unit {Number(effectiveUnitCost).toFixed(2)} (
                method {row.costMethod})
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

