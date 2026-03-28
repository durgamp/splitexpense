import { Router } from 'express';
import { z } from 'zod';
import { getDb, asRow } from '../database/index.js';
import { requireAuth } from '../middleware/auth.js';
import { otpRequestLimiter, otpVerifyLimiter, refreshLimiter, nameLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { generateOtp, hashOtp, verifyOtp } from '../utils/otp.js';
import {
  signAccessToken,
  generateRefreshToken,
  hashRefreshToken,
} from '../utils/token.js';
import { newId } from '../utils/id.js';
import type { UserRow, OtpRow, RefreshTokenRow } from '../types/index.js';

const router = Router();

const OTP_TTL_MS = (Number(process.env.OTP_EXPIRES_MINUTES) || 10) * 60 * 1000;
const REFRESH_TTL_MS = (Number(process.env.JWT_REFRESH_EXPIRES_DAYS) || 7) * 86400 * 1000;
const OTP_MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS) || 3;
const DEV_EXPOSE_OTP = process.env.OTP_DEV_EXPOSE === 'true';

// ── Schemas ──────────────────────────────────────────────────────────────────
const phoneSchema = z.object({
  phone: z.string().regex(/^\+[1-9]\d{6,14}$/, 'Invalid E.164 phone number'),
});

const verifySchema = z.object({
  phone: z.string().regex(/^\+[1-9]\d{6,14}$/),
  code: z.string().length(6).regex(/^\d{6}$/),
});

const nameSchema = z.object({
  name: z.string().min(2).max(60).trim(),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});

// ── POST /auth/request-otp ───────────────────────────────────────────────────
router.post(
  '/request-otp',
  otpRequestLimiter,
  validate(phoneSchema),
  async (req, res) => {
    const { phone } = req.body as z.infer<typeof phoneSchema>;
    const db = getDb();
    const now = Date.now();

    // Invalidate any existing OTPs for this phone
    db.prepare('DELETE FROM otp_requests WHERE phone = ?').run(phone);

    const code = generateOtp();
    const codeHash = await hashOtp(code);

    db.prepare(`
      INSERT INTO otp_requests (id, phone, code_hash, expires_at, attempts, created_at)
      VALUES (?, ?, ?, ?, 0, ?)
    `).run(newId(), phone, codeHash, now + OTP_TTL_MS, now);

    // In production: send SMS via Twilio/MSG91 here
    // In development: optionally expose the OTP in the response
    const response: Record<string, unknown> = {
      message: 'OTP sent',
      expiresAt: now + OTP_TTL_MS,
    };
    // Expose OTP in response when OTP_DEV_EXPOSE=true (set in Vercel env vars for testing).
    // Remove OTP_DEV_EXPOSE or set it to false before going live with real users.
    if (DEV_EXPOSE_OTP) {
      response.otp = code;
    }

    res.json(response);
  }
);

// ── POST /auth/verify-otp ────────────────────────────────────────────────────
router.post(
  '/verify-otp',
  otpVerifyLimiter,
  validate(verifySchema),
  async (req, res) => {
    const { phone, code } = req.body as z.infer<typeof verifySchema>;
    const db = getDb();
    const now = Date.now();

    const otpRow = asRow<OtpRow | undefined>(db
      .prepare('SELECT * FROM otp_requests WHERE phone = ? AND expires_at > ? ORDER BY created_at DESC LIMIT 1')
      .get(phone, now));

    if (!otpRow) {
      res.status(400).json({ error: 'OTP expired or not found. Request a new one.' });
      return;
    }

    if (otpRow.attempts >= OTP_MAX_ATTEMPTS) {
      db.prepare('DELETE FROM otp_requests WHERE id = ?').run(otpRow.id);
      res.status(400).json({ error: 'Too many incorrect attempts. Request a new OTP.' });
      return;
    }

    const valid = await verifyOtp(code, otpRow.code_hash);

    if (!valid) {
      db.prepare('UPDATE otp_requests SET attempts = attempts + 1 WHERE id = ?').run(otpRow.id);
      res.status(400).json({ error: 'Invalid code', attemptsRemaining: OTP_MAX_ATTEMPTS - otpRow.attempts - 1 });
      return;
    }

    // OTP valid — delete it (single use)
    db.prepare('DELETE FROM otp_requests WHERE id = ?').run(otpRow.id);

    // Upsert user
    let user = asRow<UserRow | undefined>(db.prepare('SELECT * FROM users WHERE phone = ?').get(phone));
    const isNewUser = !user;

    if (!user) {
      const id = newId();
      db.prepare(`
        INSERT INTO users (id, phone, name, created_at, last_active_at)
        VALUES (?, ?, '', ?, ?)
      `).run(id, phone, now, now);
      user = asRow<UserRow>(db.prepare('SELECT * FROM users WHERE id = ?').get(id));
    } else {
      db.prepare('UPDATE users SET last_active_at = ? WHERE id = ?').run(now, user.id);
    }

    // Issue tokens
    const accessToken = signAccessToken(user.id, user.phone);
    const refreshToken = generateRefreshToken();
    const tokenHash = hashRefreshToken(refreshToken);

    db.prepare(`
      INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(newId(), user.id, tokenHash, now + REFRESH_TTL_MS, now);

    // Reconcile pending group memberships
    if (user.name) {
      db.prepare(`
        UPDATE group_members SET user_id = ?, status = 'active', joined_at = ?
        WHERE phone = ? AND status = 'pending'
      `).run(user.id, now, phone);
    }

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        phone: user.phone,
        name: user.name,
        createdAt: user.created_at,
        lastActiveAt: user.last_active_at,
      },
      isNewUser,
    });
  }
);

// ── PATCH /auth/name ─────────────────────────────────────────────────────────
router.patch('/name', requireAuth, nameLimiter, validate(nameSchema), (req, res) => {
  const { name } = req.body as z.infer<typeof nameSchema>;
  const db = getDb();
  const now = Date.now();

  db.prepare('UPDATE users SET name = ?, last_active_at = ? WHERE id = ?')
    .run(name, now, req.userId!);

  // Reconcile pending memberships once user has a name
  db.prepare(`
    UPDATE group_members SET user_id = ?, status = 'active', joined_at = ?
    WHERE phone = ? AND status = 'pending'
  `).run(req.userId!, now, req.userPhone!);

  const user = asRow<UserRow>(db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId!));
  res.json({
    user: { id: user.id, phone: user.phone, name: user.name, createdAt: user.created_at, lastActiveAt: user.last_active_at },
  });
});

// ── POST /auth/refresh ───────────────────────────────────────────────────────
router.post('/refresh', refreshLimiter, validate(refreshSchema), (req, res) => {
  const { refreshToken } = req.body as z.infer<typeof refreshSchema>;
  const db = getDb();
  const now = Date.now();
  const tokenHash = hashRefreshToken(refreshToken);

  const row = asRow<RefreshTokenRow | undefined>(db
    .prepare('SELECT * FROM refresh_tokens WHERE token_hash = ? AND expires_at > ?')
    .get(tokenHash, now));

  if (!row) {
    res.status(401).json({ error: 'Invalid or expired refresh token' });
    return;
  }

  const user = asRow<UserRow | undefined>(db.prepare('SELECT * FROM users WHERE id = ?').get(row.user_id));
  if (!user) {
    res.status(401).json({ error: 'User not found' });
    return;
  }

  // Rotate refresh token (invalidate old, issue new)
  const newRefreshToken = generateRefreshToken();
  const newTokenHash = hashRefreshToken(newRefreshToken);

  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM refresh_tokens WHERE id = ?').run(row.id);
    db.prepare(`
      INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(newId(), user.id, newTokenHash, now + REFRESH_TTL_MS, now);
    db.prepare('UPDATE users SET last_active_at = ? WHERE id = ?').run(now, user.id);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  res.json({
    accessToken: signAccessToken(user.id, user.phone),
    refreshToken: newRefreshToken,
  });
});

// ── DELETE /auth/logout ──────────────────────────────────────────────────────
router.delete('/logout', requireAuth, validate(refreshSchema), (req, res) => {
  const { refreshToken } = req.body as z.infer<typeof refreshSchema>;
  const db = getDb();
  const tokenHash = hashRefreshToken(refreshToken);
  db.prepare('DELETE FROM refresh_tokens WHERE user_id = ? AND token_hash = ?')
    .run(req.userId!, tokenHash);
  res.json({ success: true });
});

export default router;
