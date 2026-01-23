/**
 * PPC Transformers
 * 
 * Utilities for transforming Amazon SP-API Advertising/PPC responses
 */

import {
  parseMoney,
  parseCurrency,
  parseDate,
  parseFloatSafe,
  normalizeString,
} from './common.transformer'

/**
 * Amazon SP-API PPC Metric structure
 */
export interface AmazonPPCMetric {
  campaignId?: string
  adGroupId?: string
  keywordId?: string
  keyword?: string
  matchType?: string
  date?: string
  impressions?: number
  clicks?: number
  cost?: {
    amount?: string | number
    currencyCode?: string
  }
  attributedSales14d?: {
    amount?: string | number
    currencyCode?: string
  }
  attributedUnits14d?: number
  attributedConversions14d?: number
  [key: string]: any
}

/**
 * Transformed PPC metric data
 */
export interface TransformedPPCMetric {
  campaignId: string
  adGroupId: string | null
  keywordId: string | null
  keyword: string | null
  matchType: string | null
  date: Date | null
  impressions: number
  clicks: number
  spend: number | null
  sales: number | null
  currency: string | null
  attributedUnits: number
  attributedConversions: number
  acos: number | null
  roas: number | null
  ctr: number | null
  cpc: number | null
}

/**
 * Transform Amazon PPC Metric to internal format
 * 
 * @param metric - Amazon PPC Metric
 * @returns Transformed PPC metric data
 */
export function transformPPCMetric(metric: AmazonPPCMetric): TransformedPPCMetric {
  const spend = parseFloatSafe(
    typeof metric.cost?.amount === 'string'
      ? metric.cost.amount
      : metric.cost?.amount?.toString()
  )
  const sales = parseFloatSafe(
    typeof metric.attributedSales14d?.amount === 'string'
      ? metric.attributedSales14d.amount
      : metric.attributedSales14d?.amount?.toString()
  )
  const currency =
    metric.cost?.currencyCode || metric.attributedSales14d?.currencyCode || null

  // Calculate derived metrics
  const acos = spend && sales ? (spend / sales) * 100 : null
  const roas = spend && sales ? sales / spend : null
  const ctr = metric.impressions && metric.clicks ? (metric.clicks / metric.impressions) * 100 : null
  const cpc = metric.clicks && spend ? spend / metric.clicks : null

  return {
    campaignId: metric.campaignId || '',
    adGroupId: normalizeString(metric.adGroupId),
    keywordId: normalizeString(metric.keywordId),
    keyword: normalizeString(metric.keyword),
    matchType: normalizeString(metric.matchType),
    date: parseDate(metric.date),
    impressions: metric.impressions || 0,
    clicks: metric.clicks || 0,
    spend,
    sales,
    currency,
    attributedUnits: metric.attributedUnits14d || 0,
    attributedConversions: metric.attributedConversions14d || 0,
    acos,
    roas,
    ctr,
    cpc,
  }
}

/**
 * Transform array of PPC metrics
 * 
 * @param metrics - Array of PPC metrics
 * @returns Array of transformed PPC metric data
 */
export function transformPPCMetrics(
  metrics?: AmazonPPCMetric[] | null
): TransformedPPCMetric[] {
  if (!metrics || !Array.isArray(metrics)) return []
  return metrics.map(transformPPCMetric)
}

/**
 * Aggregate PPC metrics by campaign
 * 
 * @param metrics - Array of transformed PPC metrics
 * @returns Aggregated metrics by campaign ID
 */
export function aggregatePPCMetricsByCampaign(
  metrics: TransformedPPCMetric[]
): Record<string, {
  impressions: number
  clicks: number
  spend: number
  sales: number
  attributedUnits: number
  attributedConversions: number
  acos: number | null
  roas: number | null
  ctr: number | null
  cpc: number | null
}> {
  const aggregated: Record<string, any> = {}

  for (const metric of metrics) {
    const campaignId = metric.campaignId
    if (!campaignId) continue

    if (!aggregated[campaignId]) {
      aggregated[campaignId] = {
        impressions: 0,
        clicks: 0,
        spend: 0,
        sales: 0,
        attributedUnits: 0,
        attributedConversions: 0,
      }
    }

    aggregated[campaignId].impressions += metric.impressions
    aggregated[campaignId].clicks += metric.clicks
    aggregated[campaignId].spend += metric.spend || 0
    aggregated[campaignId].sales += metric.sales || 0
    aggregated[campaignId].attributedUnits += metric.attributedUnits
    aggregated[campaignId].attributedConversions += metric.attributedConversions
  }

  // Calculate derived metrics for each campaign
  for (const campaignId in aggregated) {
    const agg = aggregated[campaignId]
    agg.acos = agg.spend && agg.sales ? (agg.spend / agg.sales) * 100 : null
    agg.roas = agg.spend && agg.sales ? agg.sales / agg.spend : null
    agg.ctr = agg.impressions && agg.clicks ? (agg.clicks / agg.impressions) * 100 : null
    agg.cpc = agg.clicks && agg.spend ? agg.spend / agg.clicks : null
  }

  return aggregated
}
