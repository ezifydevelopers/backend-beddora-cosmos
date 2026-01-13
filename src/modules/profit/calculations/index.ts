/**
 * Profit calculation utilities
 * 
 * Place complex profit calculation logic here
 * This can be extracted to a separate microservice later
 * 
 * Future microservice separation point:
 * - Move all calculation logic to a profit-calculation-service
 * - Use message queue (RabbitMQ, Kafka) for async calculations
 * - Cache results in Redis
 */

/**
 * Calculate profit margin
 */
export function calculateMargin(revenue: number, cost: number): number {
  if (revenue === 0) return 0
  return ((revenue - cost) / revenue) * 100
}

/**
 * Calculate ACOS (Advertising Cost of Sales)
 */
export function calculateACOS(adSpend: number, sales: number): number {
  if (sales === 0) return 0
  return (adSpend / sales) * 100
}

/**
 * Calculate ROAS (Return on Ad Spend)
 */
export function calculateROAS(revenue: number, adSpend: number): number {
  if (adSpend === 0) return 0
  return revenue / adSpend
}

