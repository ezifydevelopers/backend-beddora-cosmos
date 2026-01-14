import { z } from 'zod'

/**
 * Cost method options supported by the COGS module.
 * Stored as Prisma enum `CostMethod`.
 */
export const costMethodSchema = z.enum(['BATCH', 'TIME_PERIOD', 'WEIGHTED_AVERAGE'])

/**
 * Create COGS entry request schema
 *
 * Notes:
 * - `unitCost` is optional because it can be calculated from `Batch` data based on `costMethod`.
 * - `shipmentCost` is optional; if provided it is added to `totalCost`.
 * - For `BATCH` method, `batchId` is required.
 * - For `TIME_PERIOD` method, `periodStart` and `periodEnd` are required (used to pick batches in that range).
 * - For `WEIGHTED_AVERAGE` method, `asOf` is optional (defaults to now; used to pick batches received up to date).
 */
export const createCogsSchema = z
  .object({
    accountId: z.string().uuid(),
    marketplaceId: z.string().uuid(),
    sku: z.string().min(1).max(128),
    quantity: z.number().int().positive(),
    costMethod: costMethodSchema,

    // Optional calculation inputs
    batchId: z.string().uuid().optional(),
    unitCost: z.number().positive().optional(),
    shipmentCost: z.number().nonnegative().optional(),

    // Time-based calculation inputs
    periodStart: z.string().datetime().optional(),
    periodEnd: z.string().datetime().optional(),
    asOf: z.string().datetime().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.costMethod === 'BATCH' && !val.batchId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'batchId is required for BATCH costing method' })
    }
    if (val.costMethod === 'TIME_PERIOD' && (!val.periodStart || !val.periodEnd)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'periodStart and periodEnd are required for TIME_PERIOD costing method',
      })
    }
  })

export const updateCogsSchema = z.object({
  // Only admins/managers can update; validation is here, authorization is in routes.
  marketplaceId: z.string().uuid().optional(),
  quantity: z.number().int().positive().optional(),
  unitCost: z.number().positive().optional(),
  shipmentCost: z.number().nonnegative().nullable().optional(),
})

