import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/token.js';

/**
 * Middleware: validates the Bearer token in Authorization header.
 * Sets req.userId, req.userEmail, and req.userPhone on success.
 * req.userPhone is empty string for users who haven't completed setup yet.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;

  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing authorization token' });
    return;
  }

  const token = header.slice(7);

  try {
    const payload = verifyAccessToken(token);
    req.userId = payload.sub;
    req.userEmail = payload.email;
    req.userPhone = payload.phone;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
