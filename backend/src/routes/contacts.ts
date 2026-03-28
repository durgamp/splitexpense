import { Router } from 'express';
import { z } from 'zod';
import { getDb, asRows } from '../database/index.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

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
router.post('/match', validate(matchSchema), (req, res) => {
  const { hashes } = req.body as z.infer<typeof matchSchema>;
  const db = getDb();

  if (hashes.length === 0) {
    res.json({ matched: [] });
    return;
  }

  const placeholders = hashes.map(() => '?').join(',');
  const rows = asRows<{ hash: string; user_id: string }>(db
    .prepare(`SELECT hash, user_id FROM contact_hashes WHERE hash IN (${placeholders})`)
    .all(...hashes));

  res.json({ matched: rows.map((r) => ({ hash: r.hash, userId: r.user_id })) });
});

// ── POST /contacts/register ───────────────────────────────────────────────────
// Called after signup to register the user's hash for discoverability.
router.post('/register', validate(registerSchema), (req, res) => {
  const { hash } = req.body as z.infer<typeof registerSchema>;
  const db = getDb();

  db.prepare(`
    INSERT OR REPLACE INTO contact_hashes (hash, user_id, created_at)
    VALUES (?, ?, ?)
  `).run(hash, req.userId!, Date.now());

  res.json({ success: true });
});

export default router;
