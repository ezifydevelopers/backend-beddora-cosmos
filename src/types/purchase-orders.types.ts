export interface PurchaseOrderFilters {
  accountId: string
  supplierId?: string
  marketplaceId?: string
  status?: string
  sku?: string
}

export interface PurchaseOrderItemInput {
  sku: string
  quantity: number
  unitCost: number
  productId?: string
}

export interface PurchaseOrderPayload {
  accountId: string
  supplierId: string
  marketplaceId?: string
  poNumber: string
  estimatedDeliveryDate?: string
  items: PurchaseOrderItemInput[]
}

export interface PurchaseOrderUpdatePayload {
  accountId: string
  supplierId?: string
  marketplaceId?: string
  status?: string
  estimatedDeliveryDate?: string
}

export interface PurchaseOrderResponse {
  id: string
  accountId: string
  supplierId: string
  marketplaceId?: string | null
  poNumber: string
  status: string
  estimatedDeliveryDate?: Date | null
  totalQuantity: number
  totalCost: number
  orderDate: Date
  receivedDate?: Date | null
  supplier?: {
    id: string
    name: string
    leadTimeDays: number
  }
  marketplace?: {
    id: string
    name: string
    code: string
  } | null
  items?: Array<{
    id: string
    sku: string
    quantity: number
    unitCost: number
    totalCost: number
  }>
}

export interface PurchaseOrderListResponse {
  data: PurchaseOrderResponse[]
  total: number
}

export interface InboundShipmentFilters {
  accountId: string
  purchaseOrderId?: string
  sku?: string
  status?: string
}

export interface InboundShipmentUpdatePayload {
  accountId: string
  quantityReceived: number
  status?: string
  receivedDate?: string
}

export interface InboundShipmentResponse {
  id: string
  purchaseOrderId: string
  sku: string
  quantityShipped: number
  quantityReceived: number
  shipmentDate: Date
  receivedDate?: Date | null
  status: string
  purchaseOrder?: {
    id: string
    poNumber: string
    marketplaceId?: string | null
  }
}

export interface POAlertResponse {
  delayed: PurchaseOrderResponse[]
  upcoming: PurchaseOrderResponse[]
}

