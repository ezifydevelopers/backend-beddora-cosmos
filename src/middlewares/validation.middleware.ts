import { Request, Response, NextFunction } from 'express'
import { AnyZodObject, ZodError, ZodEffects, ZodTypeAny } from 'zod'
import { validationResult } from 'express-validator'
import { AppError } from './error.middleware'

/**
 * Zod validation middleware
 * Used for Zod schema validation
 * 
 * Supports both ZodObject and ZodEffects (from .refine(), .superRefine(), etc.)
 */
export const validate = (schema: AnyZodObject | ZodEffects<any, any>) => async (req: Request, res: Response, next: NextFunction) => {
    try {
        await schema.parseAsync(req.body)
        next()
    } catch (error) {
        if (error instanceof ZodError) {
            const errorMessage = error.errors.map((err) => err.message).join(', ')
            next(new AppError(errorMessage, 400))
        } else {
            next(error)
        }
    }
}

/**
 * Express-validator validation middleware
 * Checks validation results from express-validator chains
 * Must be used after express-validator validation chains
 */
export const validateRequest = (req: Request, res: Response, next: NextFunction): void => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
        const errorMessages = errors.array().map((err) => err.msg).join(', ')
        next(new AppError(errorMessages, 400))
        return
    }
    next()
}
