import { Request, Response, NextFunction } from 'express'
import { AnyZodObject, ZodError } from 'zod'
import { AppError } from './error.middleware'

export const validate = (schema: AnyZodObject) => async (req: Request, res: Response, next: NextFunction) => {
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
