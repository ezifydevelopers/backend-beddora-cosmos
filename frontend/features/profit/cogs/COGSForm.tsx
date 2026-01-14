import * as React from 'react'
import { useAddCOGS } from './useAddCOGS'
import { useUpdateCOGS } from './useUpdateCOGS'
import type { CostMethod, CreateCogsRequest, CogsRow, UpdateCogsRequest } from './profitCogs.slice'

type Mode = 'create' | 'edit'

export function COGSForm(props: {
  mode: Mode
  accountId: string
  initial?: Partial<CogsRow> & { id?: string }
  onSuccess?: () => void
}) {
  const [addCogs, addState] = useAddCOGS()
  const [updateCogs, updateState] = useUpdateCOGS()

  const [sku, setSku] = React.useState(props.initial?.sku ?? '')
  const [marketplaceId, setMarketplaceId] = React.useState(props.initial?.marketplaceId ?? '')
  const [quantity, setQuantity] = React.useState<number>(props.initial?.quantity ?? 1)
  const [costMethod, setCostMethod] = React.useState<CostMethod>((props.initial?.costMethod as CostMethod) ?? 'WEIGHTED_AVERAGE')
  const [unitCost, setUnitCost] = React.useState<number>(props.initial?.unitCost ? Number(props.initial.unitCost) : 0)
  const [shipmentCost, setShipmentCost] = React.useState<number>(props.initial?.shipmentCost ? Number(props.initial.shipmentCost) : 0)
  const [batchId, setBatchId] = React.useState<string>(props.initial?.batchId ?? '')

  const isBusy = addState.isLoading || updateState.isLoading

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (props.mode === 'create') {
      const payload: CreateCogsRequest = {
        accountId: props.accountId,
        marketplaceId,
        sku,
        quantity,
        costMethod,
        ...(batchId ? { batchId } : {}),
        ...(unitCost > 0 ? { unitCost } : {}),
        ...(shipmentCost > 0 ? { shipmentCost } : {}),
      }
      await addCogs(payload).unwrap()
    } else {
      const payload: UpdateCogsRequest = {
        id: props.initial?.id as string,
        accountId: props.accountId,
        ...(marketplaceId ? { marketplaceId } : {}),
        ...(quantity ? { quantity } : {}),
        ...(unitCost > 0 ? { unitCost } : {}),
        shipmentCost,
      }
      await updateCogs(payload).unwrap()
    }

    props.onSuccess?.()
  }

  return (
    <form onSubmit={onSubmit} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>{props.mode === 'create' ? 'Add COGS' : 'Edit COGS'}</div>

      <div style={{ display: 'grid', gap: 8 }}>
        <label>
          SKU
          <input value={sku} onChange={(e) => setSku(e.target.value)} disabled={isBusy || props.mode === 'edit'} />
        </label>

        <label>
          Marketplace ID
          <input value={marketplaceId} onChange={(e) => setMarketplaceId(e.target.value)} disabled={isBusy} />
        </label>

        <label>
          Quantity
          <input type="number" value={quantity} min={1} onChange={(e) => setQuantity(Number(e.target.value))} disabled={isBusy} />
        </label>

        <label>
          Cost method
          <select value={costMethod} onChange={(e) => setCostMethod(e.target.value as CostMethod)} disabled={isBusy}>
            <option value="BATCH">Batch</option>
            <option value="TIME_PERIOD">Time period</option>
            <option value="WEIGHTED_AVERAGE">Weighted average</option>
          </select>
        </label>

        {costMethod === 'BATCH' ? (
          <label>
            Batch ID
            <input value={batchId} onChange={(e) => setBatchId(e.target.value)} disabled={isBusy} />
          </label>
        ) : null}

        <label>
          Unit cost (optional override)
          <input type="number" value={unitCost} min={0} step="0.01" onChange={(e) => setUnitCost(Number(e.target.value))} disabled={isBusy} />
        </label>

        <label>
          Shipment cost (optional)
          <input type="number" value={shipmentCost} min={0} step="0.01" onChange={(e) => setShipmentCost(Number(e.target.value))} disabled={isBusy} />
        </label>

        <button type="submit" disabled={isBusy}>
          {isBusy ? 'Saving…' : props.mode === 'create' ? 'Create' : 'Update'}
        </button>
      </div>
    </form>
  )
}

