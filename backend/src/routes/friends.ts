/**
 * Friends — non-group (direct) expense connections between two users.
 * Backed by a groups row with type='direct'. Only 2 members allowed.
 * Direct groups are hidden from the main /groups list.
 */
import { Router } from 'express';
import { z } from 'zod';
import { getDb, asRow, asRows } from '../database/index.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { newId, randomHex } from '../utils/id.js';
import type { GroupRow, GroupMemberRow, UserRow } from '../types/index.js';

const router = Router();
router.use(requireAuth);

const addFriendSchema = z.object({
  phone: z.string().regex(/^\+[1-9]\d{6,14}$/, 'Invalid phone number'),
  name: z.string().min(1).max(80).trim(),
});

function buildGroup(row: GroupRow, db: ReturnType<typeof getDb>) {
  const members = asRows<GroupMemberRow>(db
    .prepare("SELECT * FROM group_members WHERE group_id = ? AND status != 'removed'")
    .all(row.id));
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    createdBy: row.created_by,
    createdAt: row.created_at,
    inviteToken: row.invite_token,
    inviteTokenCreatedAt: row.invite_token_created_at,
    members: members.map((m) => ({
      phone: m.phone, userId: m.user_id, name: m.name,
      status: m.status, role: m.role, invitedBy: m.invited_by, joinedAt: m.joined_at,
    })),
  };
}

// ── GET /friends ──────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const db = getDb();
  const rows = asRows<GroupRow>(db.prepare(`
    SELECT g.* FROM groups g
    JOIN group_members gm ON gm.group_id = g.id
    WHERE gm.phone = ? AND gm.status != 'removed' AND g.type = 'direct'
    ORDER BY g.created_at DESC
  `).all(req.userPhone!));
  res.json({ friends: rows.map((r) => buildGroup(r, db)) });
});

// ── POST /friends ─────────────────────────────────────────────────────────────
router.post('/', validate(addFriendSchema), (req, res) => {
  const { phone, name } = req.body as z.infer<typeof addFriendSchema>;
  const db = getDb();
  const now = Date.now();

  if (phone === req.userPhone!) {
    res.status(400).json({ error: 'Cannot add yourself as a friend' });
    return;
  }

  // Check if a direct group already exists between these two users
  const existing = asRow<GroupRow | undefined>(db.prepare(`
    SELECT g.* FROM groups g
    JOIN group_members gm1 ON gm1.group_id = g.id AND gm1.phone = ?
    JOIN group_members gm2 ON gm2.group_id = g.id AND gm2.phone = ?
    WHERE g.type = 'direct'
    LIMIT 1
  `).get(req.userPhone!, phone));

  if (existing) {
    res.status(409).json({ error: 'You already have a direct connection with this person', groupId: existing.id });
    return;
  }

  const creator = asRow<UserRow>(db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId!));
  const friendUser = asRow<UserRow | undefined>(db.prepare('SELECT * FROM users WHERE phone = ?').get(phone));
  const id = newId();
  const inviteToken = randomHex(16);

  db.exec('BEGIN');
  try {
    db.prepare(`
      INSERT INTO groups (id, name, type, created_by, invite_token, invite_token_created_at, created_at)
      VALUES (?, ?, 'direct', ?, ?, ?, ?)
    `).run(id, name, req.userId!, inviteToken, now, now);

    // Creator
    db.prepare(`
      INSERT INTO group_members (group_id, phone, user_id, name, status, role, invited_by, joined_at)
      VALUES (?, ?, ?, ?, 'active', 'admin', ?, ?)
    `).run(id, creator.phone, creator.id, creator.name, creator.id, now);

    // Friend
    db.prepare(`
      INSERT INTO group_members (group_id, phone, user_id, name, status, role, invited_by, joined_at)
      VALUES (?, ?, ?, ?, ?, 'member', ?, ?)
    `).run(
      id, phone,
      friendUser?.id ?? null,
      name || friendUser?.name || phone,
      friendUser ? 'active' : 'pending',
      creator.id,
      friendUser ? now : null,
    );

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  const row = asRow<GroupRow>(db.prepare('SELECT * FROM groups WHERE id = ?').get(id));
  res.status(201).json({ friend: buildGroup(row, db) });
});

export default router;
