import rateLimit from 'express-rate-limit';

const isDev = process.env.NODE_ENV !== 'production';

/** OTP request: max 3/hr in prod, 30/hr in dev. */
export const otpRequestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: isDev ? 30 : 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many OTP requests. Please wait before trying again.' },
  skipSuccessfulRequests: false,
});

/** OTP verify: max 10 attempts per hour per IP. */
export const otpVerifyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many verification attempts. Please wait.' },
});

/** General API: 200 requests per 15 minutes per IP. */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
});

/** Auth refresh: max 30 per 15 minutes per IP. */
export const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many refresh attempts.' },
});

/** Name update: max 10 per hour per IP. */
export const nameLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many name update attempts. Please wait.' },
});
