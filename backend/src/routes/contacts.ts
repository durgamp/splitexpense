import { Router } from 'express';
import { z } from 'zod';
import { getRequest, sql } from '../database/index.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();
router.use(requireAuth);

const hexHash = z.string().length(64).regex(/^[a-f0-9]{64}$/, 'Must be a valid SHA-256 hex hash');

const matchSchema = z.object({
  hashes: z.array(hexHash).max(500),
});

const registerSchema = z.object({
  hash: hexHash,
});

// ── POST /contacts/match ──────────────────────────────────────────────────────
// Accepts an array of SHA-256 hashed phone numbers.
// Returns which hashes belong to registered users.
// Raw phone numbers never leave the client.
router.post('/match', validate(matchSchema), asyncHandler(async (req, res) => {
  const { hashes } = req.body as z.infer<typeof matchSchema>;

  if (hashes.length === 0) {
    res.json({ matched: [] });
    return;
  }

  // Build named params dynamically — values are validated SHA-256 hashes (safe)
  const hashReq = await getRequest();
  hashes.forEach((h, i) => hashReq.input(`h${i}`, sql.NVarChar(64), h));
  const inList = hashes.map((_, i) => `@h${i}`).join(',');

  const rows = (await hashReq.query(
    `SELECT hash, user_id FROM contact_hashes WHERE hash IN (${inList})`
  )).recordset as { hash: string; user_id: string }[];

  res.json({ matched: rows.map((r) => ({ hash: r.hash, userId: r.user_id })) });
}));

// ── POST /contacts/register ───────────────────────────────────────────────────
// Called after signup to register the user's hash for discoverability.
router.post('/register', validate(registerSchema), asyncHandler(async (req, res) => {
  const { hash } = req.body as z.infer<typeof registerSchema>;
  const now = Date.now();

  // MERGE = upsert in T-SQL (equivalent to INSERT OR REPLACE)
  await (await getRequest())
    .input('hash',   sql.NVarChar(64), hash)
    .input('userId', sql.NVarChar(36), req.userId!)
    .input('now',    sql.BigInt,       BigInt(now))
    .query(`
      MERGE contact_hashes AS target
      USING (VALUES (@hash, @userId, @now)) AS source (hash, user_id, created_at)
      ON target.hash = source.hash
      WHEN MATCHED THEN
        UPDATE SET user_id = source.user_id, created_at = source.created_at
      WHEN NOT MATCHED THEN
        INSERT (hash, user_id, created_at) VALUES (source.hash, source.user_id, source.created_at);
    `);

  res.json({ success: true });
}));

export default router;
