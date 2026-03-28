import type { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

type Target = 'body' | 'params' | 'query';

/**
 * Factory that returns a middleware validating req[target] against a Zod schema.
 * Responds with 400 and structured errors on failure.
 */
export function validate(schema: ZodSchema, target: Target = 'body') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[target]);
    if (!result.success) {
      const errors = (result.error as ZodError).errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      res.status(400).json({ error: 'Validation failed', details: errors });
      return;
    }
    // Replace with parsed/coerced values
    (req as unknown as Record<string, unknown>)[target] = result.data;
    next();
  };
}
