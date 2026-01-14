import { Request, Response, NextFunction } from 'express'
import { ZodError, ZodTypeAny } from 'zod'
import { AppError } from './error.middleware'

/**
 * Request body validation middleware.
 *
 * Accepts any Zod schema (including refinements/effects), not just plain objects.
 */
export const validate = (schema: ZodTypeAny) => async (req: Request, _res: Response, next: NextFunction) => {
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
