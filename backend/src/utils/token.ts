import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-in-production';
const ACCESS_EXPIRES = process.env.JWT_ACCESS_EXPIRES_IN ?? '15m';

if (process.env.NODE_ENV === 'production' && JWT_SECRET === 'dev-secret-change-in-production') {
  console.error('[FATAL] JWT_SECRET is using the default insecure value in production. Set a strong JWT_SECRET env variable.');
  process.exit(1);
}

export interface AccessTokenPayload {
  sub: string;   // userId
  phone: string;
}

/** Sign a short-lived access token. */
export function signAccessToken(userId: string, phone: string): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return jwt.sign({ sub: userId, phone } as AccessTokenPayload, JWT_SECRET, {
    expiresIn: ACCESS_EXPIRES as any,
    issuer: 'splitease',
    audience: 'splitease-client',
  });
}

/** Verify and decode an access token. Throws on invalid/expired. */
export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, JWT_SECRET, {
    issuer: 'splitease',
    audience: 'splitease-client',
  }) as AccessTokenPayload;
}

/** Generate a cryptographically secure opaque refresh token. */
export function generateRefreshToken(): string {
  return crypto.randomBytes(40).toString('hex');
}

/** SHA-256 hash a refresh token for safe DB storage. */
export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
