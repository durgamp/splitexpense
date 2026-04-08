import { Router } from 'express';
import { z } from 'zod';
import { getPool, getRequest, withTransaction, toNum, sql } from '../database/index.js';
import { requireAuth } from '../middleware/auth.js';
import { otpRequestLimiter, otpVerifyLimiter, refreshLimiter, nameLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { generateOtp, hashOtp, verifyOtp } from '../utils/otp.js';
import { sendOtpEmail } from '../utils/email.js';
import { signAccessToken, generateRefreshToken, hashRefreshToken } from '../utils/token.js';
import { newId } from '../utils/id.js';
import type { UserRow, OtpRow, RefreshTokenRow } from '../types/index.js';

const router = Router();

const OTP_TTL_MS   = (Number(process.env.OTP_EXPIRES_MINUTES) || 10) * 60 * 1000;
const REFRESH_TTL_MS = (Number(process.env.JWT_REFRESH_EXPIRES_DAYS) || 7) * 86400 * 1000;
const OTP_MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS) || 3;
const DEV_EXPOSE_OTP = process.env.OTP_DEV_EXPOSE === 'true';

// ── Schemas ───────────────────────────────────────────────────────────────────

const emailSchema   = z.object({ email: z.string().email().toLowerCase() });
const verifySchema  = z.object({ email: z.string().email().toLowerCase(), code: z.string().length(6).regex(/^\d{6}$/) });
const setupSchema   = z.object({ phone: z.string().regex(/^\+[1-9]\d{6,14}$/, 'Invalid E.164 phone') });
const nameSchema    = z.object({ name: z.string().min(2).max(60).trim() });
const refreshSchema = z.object({ refreshToken: z.string().min(10) });

// ── Helpers ───────────────────────────────────────────────────────────────────

function serializeUser(u: UserRow) {
  return {
    id: u.id,
    email: u.email ?? '',
    phone: u.phone ?? '',
    name: u.name,
    createdAt: toNum(u.created_at),
    lastActiveAt: toNum(u.last_active_at),
  };
}

// ── POST /auth/request-otp ────────────────────────────────────────────────────

router.post('/request-otp', otpRequestLimiter, validate(emailSchema), asyncHandler(async (req, res) => {
  const { email } = req.body as z.infer<typeof emailSchema>;
  const now = Date.now();

  // Invalidate any existing OTPs for this email
  await (await getRequest()).input('email', sql.NVarChar(255), email)
    .query('DELETE FROM otp_requests WHERE email = @email');

  const code = generateOtp();
  const codeHash = await hashOtp(code);

  await (await getRequest())
    .input('id',        sql.NVarChar(36),  newId())
    .input('email',     sql.NVarChar(255), email)
    .input('codeHash',  sql.NVarChar(100), codeHash)
    .input('expiresAt', sql.BigInt,        BigInt(now + OTP_TTL_MS))
    .input('now',       sql.BigInt,        BigInt(now))
    .query(`INSERT INTO otp_requests (id, email, code_hash, expires_at, attempts, created_at)
            VALUES (@id, @email, @codeHash, @expiresAt, 0, @now)`);

  await sendOtpEmail(email, code);

  const response: Record<string, unknown> = { message: 'OTP sent', expiresAt: now + OTP_TTL_MS };
  if (DEV_EXPOSE_OTP) response.otp = code;
  res.json(response);
}));

// ── POST /auth/verify-otp ─────────────────────────────────────────────────────

router.post('/verify-otp', otpVerifyLimiter, validate(verifySchema), asyncHandler(async (req, res) => {
  const { email, code } = req.body as z.infer<typeof verifySchema>;
  const now = Date.now();

  const otpResult = await (await getRequest())
    .input('email', sql.NVarChar(255), email)
    .input('now',   sql.BigInt,        BigInt(now))
    .query(`SELECT TOP 1 * FROM otp_requests
            WHERE email = @email AND expires_at > @now
            ORDER BY created_at DESC`);

  const otpRow = otpResult.recordset[0] as OtpRow | undefined;
  if (!otpRow) {
    return res.status(400).json({ error: 'OTP expired or not found. Request a new one.' });
  }

  if (otpRow.attempts >= OTP_MAX_ATTEMPTS) {
    await (await getRequest()).input('id', sql.NVarChar(36), otpRow.id)
      .query('DELETE FROM otp_requests WHERE id = @id');
    return res.status(400).json({ error: 'Too many incorrect attempts. Request a new OTP.' });
  }

  const valid = await verifyOtp(code, otpRow.code_hash);
  if (!valid) {
    await (await getRequest()).input('id', sql.NVarChar(36), otpRow.id)
      .query('UPDATE otp_requests SET attempts = attempts + 1 WHERE id = @id');
    return res.status(400).json({
      error: 'Invalid code',
      attemptsRemaining: OTP_MAX_ATTEMPTS - Number(otpRow.attempts) - 1,
    });
  }

  // OTP valid — delete (single-use)
  await (await getRequest()).input('id', sql.NVarChar(36), otpRow.id)
    .query('DELETE FROM otp_requests WHERE id = @id');

  // Upsert user by email
  let userResult = await (await getRequest())
    .input('email', sql.NVarChar(255), email)
    .query('SELECT * FROM users WHERE email = @email');
  let user = userResult.recordset[0] as UserRow | undefined;
  const isNewUser = !user;

  if (!user) {
    const uid = newId();
    await (await getRequest())
      .input('id',    sql.NVarChar(36),  uid)
      .input('email', sql.NVarChar(255), email)
      .input('now',   sql.BigInt,        BigInt(now))
      .query(`INSERT INTO users (id, email, phone, name, created_at, last_active_at)
              VALUES (@id, @email, NULL, '', @now, @now)`);
    userResult = await (await getRequest()).input('id', sql.NVarChar(36), uid)
      .query('SELECT * FROM users WHERE id = @id');
    user = userResult.recordset[0] as UserRow;
  } else {
    await (await getRequest())
      .input('now', sql.BigInt, BigInt(now))
      .input('id',  sql.NVarChar(36), user.id)
      .query('UPDATE users SET last_active_at = @now WHERE id = @id');
  }

  // Reconcile pending group memberships
  if (user.phone) {
    await (await getRequest())
      .input('userId', sql.NVarChar(36), user.id)
      .input('now',    sql.BigInt,       BigInt(now))
      .input('phone',  sql.NVarChar(20), user.phone)
      .query(`UPDATE group_members SET user_id = @userId, status = 'active', joined_at = @now
              WHERE phone = @phone AND status = 'pending'`);
  }

  const accessToken  = signAccessToken(user.id, user.email ?? email, user.phone ?? '');
  const refreshToken = generateRefreshToken();
  const tokenHash    = hashRefreshToken(refreshToken);

  await (await getRequest())
    .input('id',        sql.NVarChar(36), newId())
    .input('userId',    sql.NVarChar(36), user.id)
    .input('tokenHash', sql.NVarChar(64), tokenHash)
    .input('expiresAt', sql.BigInt,       BigInt(now + REFRESH_TTL_MS))
    .input('now',       sql.BigInt,       BigInt(now))
    .query(`INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at)
            VALUES (@id, @userId, @tokenHash, @expiresAt, @now)`);

  // Re-fetch to get latest state
  const freshUser = ((await (await getRequest()).input('id', sql.NVarChar(36), user.id)
    .query('SELECT * FROM users WHERE id = @id')).recordset[0]) as UserRow;

  return res.json({ accessToken, refreshToken, user: serializeUser(freshUser), isNewUser });
}));

// ── PATCH /auth/setup ─────────────────────────────────────────────────────────

router.patch('/setup', requireAuth, nameLimiter, validate(setupSchema), asyncHandler(async (req, res) => {
  const { phone } = req.body as z.infer<typeof setupSchema>;
  const now = Date.now();

  const conflictResult = await (await getRequest())
    .input('phone', sql.NVarChar(20), phone)
    .query('SELECT id FROM users WHERE phone = @phone');
  const conflict = conflictResult.recordset[0] as { id: string } | undefined;

  if (conflict && conflict.id !== req.userId!) {
    return res.status(409).json({ error: 'This phone number is already linked to another account.' });
  }

  await (await getRequest())
    .input('phone',  sql.NVarChar(20), phone)
    .input('now',    sql.BigInt,       BigInt(now))
    .input('userId', sql.NVarChar(36), req.userId!)
    .query('UPDATE users SET phone = @phone, last_active_at = @now WHERE id = @userId');

  await (await getRequest())
    .input('userId', sql.NVarChar(36), req.userId!)
    .input('now',    sql.BigInt,       BigInt(now))
    .input('phone',  sql.NVarChar(20), phone)
    .query(`UPDATE group_members SET user_id = @userId, status = 'active', joined_at = @now
            WHERE phone = @phone AND status = 'pending'`);

  const user = ((await (await getRequest()).input('id', sql.NVarChar(36), req.userId!)
    .query('SELECT * FROM users WHERE id = @id')).recordset[0]) as UserRow;

  const accessToken  = signAccessToken(user.id, user.email ?? '', user.phone ?? '');
  const refreshToken = generateRefreshToken();
  const tokenHash    = hashRefreshToken(refreshToken);

  await (await getRequest())
    .input('id',        sql.NVarChar(36), newId())
    .input('userId',    sql.NVarChar(36), user.id)
    .input('tokenHash', sql.NVarChar(64), tokenHash)
    .input('expiresAt', sql.BigInt,       BigInt(now + REFRESH_TTL_MS))
    .input('now',       sql.BigInt,       BigInt(now))
    .query(`INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at)
            VALUES (@id, @userId, @tokenHash, @expiresAt, @now)`);

  return res.json({ accessToken, refreshToken, user: serializeUser(user) });
}));

// ── PATCH /auth/name ──────────────────────────────────────────────────────────

router.patch('/name', requireAuth, nameLimiter, validate(nameSchema), asyncHandler(async (req, res) => {
  const { name } = req.body as z.infer<typeof nameSchema>;
  const now = Date.now();

  await (await getRequest())
    .input('name',   sql.NVarChar(100), name)
    .input('now',    sql.BigInt,        BigInt(now))
    .input('userId', sql.NVarChar(36),  req.userId!)
    .query('UPDATE users SET name = @name, last_active_at = @now WHERE id = @userId');

  const user = ((await (await getRequest()).input('id', sql.NVarChar(36), req.userId!)
    .query('SELECT * FROM users WHERE id = @id')).recordset[0]) as UserRow;

  return res.json({ user: serializeUser(user) });
}));

// ── POST /auth/refresh ────────────────────────────────────────────────────────

router.post('/refresh', refreshLimiter, validate(refreshSchema), asyncHandler(async (req, res) => {
  const { refreshToken } = req.body as z.infer<typeof refreshSchema>;
  const now = Date.now();
  const tokenHash = hashRefreshToken(refreshToken);

  const rtResult = await (await getRequest())
    .input('hash', sql.NVarChar(64), tokenHash)
    .input('now',  sql.BigInt,       BigInt(now))
    .query('SELECT * FROM refresh_tokens WHERE token_hash = @hash AND expires_at > @now');
  const row = rtResult.recordset[0] as RefreshTokenRow | undefined;

  if (!row) return res.status(401).json({ error: 'Invalid or expired refresh token' });

  const userResult = await (await getRequest())
    .input('id', sql.NVarChar(36), row.user_id)
    .query('SELECT * FROM users WHERE id = @id');
  const user = userResult.recordset[0] as UserRow | undefined;
  if (!user) return res.status(401).json({ error: 'User not found' });

  const newRefreshToken = generateRefreshToken();
  const newTokenHash    = hashRefreshToken(newRefreshToken);

  await withTransaction(async (t) => {
    await new sql.Request(t).input('id', sql.NVarChar(36), row.id)
      .query('DELETE FROM refresh_tokens WHERE id = @id');
    await new sql.Request(t)
      .input('id',        sql.NVarChar(36), newId())
      .input('userId',    sql.NVarChar(36), user.id)
      .input('tokenHash', sql.NVarChar(64), newTokenHash)
      .input('expiresAt', sql.BigInt,       BigInt(now + REFRESH_TTL_MS))
      .input('now',       sql.BigInt,       BigInt(now))
      .query(`INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at)
              VALUES (@id, @userId, @tokenHash, @expiresAt, @now)`);
    await new sql.Request(t)
      .input('now',    sql.BigInt,      BigInt(now))
      .input('userId', sql.NVarChar(36), user.id)
      .query('UPDATE users SET last_active_at = @now WHERE id = @userId');
  });

  return res.json({
    accessToken:  signAccessToken(user.id, user.email ?? '', user.phone ?? ''),
    refreshToken: newRefreshToken,
  });
}));

// ── DELETE /auth/logout ───────────────────────────────────────────────────────

router.delete('/logout', requireAuth, validate(refreshSchema), asyncHandler(async (req, res) => {
  const { refreshToken } = req.body as z.infer<typeof refreshSchema>;
  const tokenHash = hashRefreshToken(refreshToken);
  await (await getRequest())
    .input('userId', sql.NVarChar(36), req.userId!)
    .input('hash',   sql.NVarChar(64), tokenHash)
    .query('DELETE FROM refresh_tokens WHERE user_id = @userId AND token_hash = @hash');
  return res.json({ success: true });
}));

export default router;
