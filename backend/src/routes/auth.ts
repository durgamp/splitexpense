import { Router } from 'express';
import { z } from 'zod';
import { getDb, asRow } from '../database/index.js';
import { requireAuth } from '../middleware/auth.js';
import { otpRequestLimiter, otpVerifyLimiter, refreshLimiter, nameLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { generateOtp, hashOtp, verifyOtp } from '../utils/otp.js';
import { sendOtpEmail } from '../utils/email.js';
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
const emailSchema = z.object({
  email: z.string().email('Invalid email address').toLowerCase(),
});

const verifySchema = z.object({
  email: z.string().email().toLowerCase(),
  code: z.string().length(6).regex(/^\d{6}$/),
});

const setupSchema = z.object({
  phone: z.string().regex(/^\+[1-9]\d{6,14}$/, 'Invalid E.164 phone number (e.g. +919876543210)'),
});

const nameSchema = z.object({
  name: z.string().min(2).max(60).trim(),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});

// ── Helper: serialize user row to API shape ───────────────────────────────────
function serializeUser(u: UserRow) {
  return {
    id: u.id,
    email: u.email ?? '',
    phone: u.phone ?? '',
    name: u.name,
    createdAt: u.created_at,
    lastActiveAt: u.last_active_at,
  };
}

// ── POST /auth/request-otp ───────────────────────────────────────────────────
router.post(
  '/request-otp',
  otpRequestLimiter,
  validate(emailSchema),
  async (req, res) => {
    const { email } = req.body as z.infer<typeof emailSchema>;
    const db = getDb();
    const now = Date.now();

    // Invalidate any existing OTPs for this email
    db.prepare('DELETE FROM otp_requests WHERE email = ?').run(email);

    const code = generateOtp();
    const codeHash = await hashOtp(code);

    db.prepare(`
      INSERT INTO otp_requests (id, email, code_hash, expires_at, attempts, created_at)
      VALUES (?, ?, ?, ?, 0, ?)
    `).run(newId(), email, codeHash, now + OTP_TTL_MS, now);

    // Send OTP email (or log to console in dev when RESEND_API_KEY is not set)
    await sendOtpEmail(email, code);

    const response: Record<string, unknown> = {
      message: 'OTP sent',
      expiresAt: now + OTP_TTL_MS,
    };

    // Expose OTP in response when OTP_DEV_EXPOSE=true (for testing).
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
    const { email, code } = req.body as z.infer<typeof verifySchema>;
    const db = getDb();
    const now = Date.now();

    const otpRow = asRow<OtpRow | undefined>(db
      .prepare('SELECT * FROM otp_requests WHERE email = ? AND expires_at > ? ORDER BY created_at DESC LIMIT 1')
      .get(email, now));

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
      res.status(400).json({
        error: 'Invalid code',
        attemptsRemaining: OTP_MAX_ATTEMPTS - otpRow.attempts - 1,
      });
      return;
    }

    // OTP valid — delete it (single use)
    db.prepare('DELETE FROM otp_requests WHERE id = ?').run(otpRow.id);

    // Upsert user by email
    let user = asRow<UserRow | undefined>(db.prepare('SELECT * FROM users WHERE email = ?').get(email));
    const isNewUser = !user;

    if (!user) {
      const id = newId();
      db.prepare(`
        INSERT INTO users (id, email, phone, name, created_at, last_active_at)
        VALUES (?, ?, NULL, '', ?, ?)
      `).run(id, email, now, now);
      user = asRow<UserRow>(db.prepare('SELECT * FROM users WHERE id = ?').get(id));
    } else {
      db.prepare('UPDATE users SET last_active_at = ? WHERE id = ?').run(now, user.id);
    }

    // Reconcile pending group memberships for returning users who already have a phone
    if (user.phone) {
      db.prepare(`
        UPDATE group_members SET user_id = ?, status = 'active', joined_at = ?
        WHERE phone = ? AND status = 'pending'
      `).run(user.id, now, user.phone);
    }

    const accessToken = signAccessToken(user.id, user.email ?? email, user.phone ?? '');
    const refreshToken = generateRefreshToken();
    const tokenHash = hashRefreshToken(refreshToken);

    db.prepare(`
      INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(newId(), user.id, tokenHash, now + REFRESH_TTL_MS, now);

    res.json({
      accessToken,
      refreshToken,
      user: serializeUser(user),
      isNewUser,
    });
  }
);

// ── PATCH /auth/setup ─────────────────────────────────────────────────────────
// Called once after the first login to save the mandatory phone number.
// Issues fresh tokens with the phone number embedded so all subsequent
// requests have req.userPhone set correctly.
router.patch('/setup', requireAuth, nameLimiter, validate(setupSchema), (req, res) => {
  const { phone } = req.body as z.infer<typeof setupSchema>;
  const db = getDb();
  const now = Date.now();

  // Ensure the phone isn't already registered to a different account
  const existing = asRow<UserRow | undefined>(db.prepare('SELECT * FROM users WHERE phone = ?').get(phone));
  if (existing && existing.id !== req.userId!) {
    res.status(409).json({ error: 'This phone number is already linked to another account.' });
    return;
  }

  db.prepare('UPDATE users SET phone = ?, last_active_at = ? WHERE id = ?')
    .run(phone, now, req.userId!);

  // Reconcile pending group memberships now that the user has a phone number
  db.prepare(`
    UPDATE group_members SET user_id = ?, status = 'active', joined_at = ?
    WHERE phone = ? AND status = 'pending'
  `).run(req.userId!, now, phone);

  const user = asRow<UserRow>(db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId!));

  // Re-issue tokens with phone now embedded
  const accessToken = signAccessToken(user.id, user.email ?? '', user.phone ?? '');
  const refreshToken = generateRefreshToken();
  const tokenHash = hashRefreshToken(refreshToken);

  // Revoke old refresh tokens for this user and issue a fresh one
  db.prepare(`
    INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(newId(), user.id, tokenHash, now + REFRESH_TTL_MS, now);

  res.json({
    accessToken,
    refreshToken,
    user: serializeUser(user),
  });
});

// ── PATCH /auth/name ──────────────────────────────────────────────────────────
// Used from the Profile screen to update display name after initial setup.
router.patch('/name', requireAuth, nameLimiter, validate(nameSchema), (req, res) => {
  const { name } = req.body as z.infer<typeof nameSchema>;
  const db = getDb();
  const now = Date.now();

  db.prepare('UPDATE users SET name = ?, last_active_at = ? WHERE id = ?')
    .run(name, now, req.userId!);

  const user = asRow<UserRow>(db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId!));
  res.json({ user: serializeUser(user) });
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
    accessToken: signAccessToken(user.id, user.email ?? '', user.phone ?? ''),
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
