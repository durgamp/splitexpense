import type { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Wraps an async route handler so that any rejected Promise is forwarded
 * to Express's next() error handler (required for Express 4 which does not
 * catch async errors automatically).
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
