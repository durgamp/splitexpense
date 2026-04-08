import type { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Wraps an async route handler so that any rejected Promise is forwarded
 * to Express's next() error handler (required for Express 4 which does not
 * catch async errors automatically).
 *
 * Typed permissively so that route handlers with narrower param generics
 * (e.g. Request<GroupParams>) are accepted without casting.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const asyncHandler = (fn: (req: any, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
