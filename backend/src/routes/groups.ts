import { Router } from 'express';
import { z } from 'zod';
import { getDb, asRow, asRows } from '../database/index.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { newId, randomHex } from '../utils/id.js';
import type { GroupRow, GroupMemberRow, UserRow } from '../types/index.js';

const router = Router();
router.use(requireAuth);

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildGroup(row: GroupRow, db: ReturnType<typeof getDb>) {
  const members = asRows<GroupMemberRow>(db
    .prepare('SELECT * FROM group_members WHERE group_id = ? AND status != ?')
    .all(row.id, 'removed'));

  return {
    id: row.id,
    name: row.name,
    createdBy: row.created_by,
    createdAt: row.created_at,
    inviteToken: row.invite_token,
    inviteTokenCreatedAt: row.invite_token_created_at,
    members: members.map((m) => ({
      phone: m.phone,
      userId: m.user_id,
      name: m.name,
      status: m.status,
      role: m.role,
      invitedBy: m.invited_by,
      joinedAt: m.joined_at,
    })),
  };
}

// ── Schemas ───────────────────────────────────────────────────────────────────

const memberSchema = z.object({
  phone: z.string().regex(/^\+[1-9]\d{6,14}$/),
  name: z.string().min(1).max(80).trim(),
});

const createGroupSchema = z.object({
  name: z.string().min(1).max(80).trim(),
  members: z.array(memberSchema).max(19),
});

const renameSchema = z.object({ name: z.string().min(1).max(80).trim() });

// ── GET /groups ───────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const db = getDb();
  const groupRows = asRows<GroupRow>(db
    .prepare(`
      SELECT g.* FROM groups g
      JOIN group_members gm ON gm.group_id = g.id
      WHERE gm.phone = ? AND gm.status != 'removed'
      ORDER BY g.created_at DESC
    `)
    .all(req.userPhone!));

  res.json({ groups: groupRows.map((r) => buildGroup(r, db)) });
});

// ── POST /groups ──────────────────────────────────────────────────────────────
router.post('/', validate(createGroupSchema), (req, res) => {
  const { name, members } = req.body as z.infer<typeof createGroupSchema>;
  const db = getDb();
  const now = Date.now();
  const id = newId();
  const inviteToken = randomHex(16);

  const creator = asRow<UserRow>(db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId!));

  db.exec('BEGIN');
  try {
    db.prepare(`
      INSERT INTO groups (id, name, created_by, invite_token, invite_token_created_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, name, req.userId!, inviteToken, now, now);

    // Add creator as admin
    db.prepare(`
      INSERT INTO group_members (group_id, phone, user_id, name, status, role, invited_by, joined_at)
      VALUES (?, ?, ?, ?, 'active', 'admin', ?, ?)
    `).run(id, creator.phone, creator.id, creator.name, creator.id, now);

    // Add additional members
    for (const m of members) {
      if (m.phone === creator.phone) continue;
      const existingUser = asRow<UserRow | undefined>(db
        .prepare('SELECT * FROM users WHERE phone = ?')
        .get(m.phone));

      db.prepare(`
        INSERT OR IGNORE INTO group_members
          (group_id, phone, user_id, name, status, role, invited_by, joined_at)
        VALUES (?, ?, ?, ?, ?, 'member', ?, ?)
      `).run(
        id, m.phone,
        existingUser?.id ?? null,
        m.name || existingUser?.name || m.phone,
        existingUser ? 'active' : 'pending',
        creator.id,
        existingUser ? now : null,
      );
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  const groupRow = asRow<GroupRow>(db.prepare('SELECT * FROM groups WHERE id = ?').get(id));
  res.status(201).json({ group: buildGroup(groupRow, db) });
});

// ── GET /groups/:id ───────────────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  const db = getDb();
  const membership = db
    .prepare("SELECT 1 FROM group_members WHERE group_id = ? AND phone = ? AND status != 'removed'")
    .get(req.params.id, req.userPhone!);

  if (!membership) {
    res.status(403).json({ error: 'Not a member of this group' });
    return;
  }

  const row = asRow<GroupRow | undefined>(db.prepare('SELECT * FROM groups WHERE id = ?').get(req.params.id));
  if (!row) {
    res.status(404).json({ error: 'Group not found' });
    return;
  }

  res.json({ group: buildGroup(row, db) });
});

// ── PATCH /groups/:id ─────────────────────────────────────────────────────────
router.patch('/:id', validate(renameSchema), (req, res) => {
  const db = getDb();
  const isAdmin = db
    .prepare("SELECT 1 FROM group_members WHERE group_id = ? AND phone = ? AND role = 'admin'")
    .get(req.params.id, req.userPhone!);

  if (!isAdmin) {
    res.status(403).json({ error: 'Only admins can rename the group' });
    return;
  }

  db.prepare('UPDATE groups SET name = ? WHERE id = ?').run(req.body.name, req.params.id);
  const row = asRow<GroupRow>(db.prepare('SELECT * FROM groups WHERE id = ?').get(req.params.id));
  res.json({ group: buildGroup(row, db) });
});

// ── POST /groups/:id/members ──────────────────────────────────────────────────
router.post('/:id/members', validate(memberSchema), (req, res) => {
  const { phone, name } = req.body as z.infer<typeof memberSchema>;
  const db = getDb();
  const now = Date.now();

  // Verify requester is a member
  const membership = db
    .prepare("SELECT 1 FROM group_members WHERE group_id = ? AND phone = ? AND status = 'active'")
    .get(req.params.id, req.userPhone!);

  if (!membership) {
    res.status(403).json({ error: 'Not a member of this group' });
    return;
  }

  const existingUser = asRow<UserRow | undefined>(db.prepare('SELECT * FROM users WHERE phone = ?').get(phone));
  const existing = asRow<GroupMemberRow | undefined>(db
    .prepare('SELECT * FROM group_members WHERE group_id = ? AND phone = ?')
    .get(req.params.id, phone));

  if (existing) {
    if (existing.status === 'removed') {
      db.prepare("UPDATE group_members SET status = 'pending', name = ? WHERE group_id = ? AND phone = ?")
        .run(name, req.params.id, phone);
    } else {
      res.status(409).json({ error: 'Member already in group' });
      return;
    }
  } else {
    db.prepare(`
      INSERT INTO group_members (group_id, phone, user_id, name, status, role, invited_by, joined_at)
      VALUES (?, ?, ?, ?, ?, 'member', ?, ?)
    `).run(
      req.params.id, phone,
      existingUser?.id ?? null,
      name || existingUser?.name || phone,
      existingUser ? 'active' : 'pending',
      req.userId!,
      existingUser ? now : null,
    );
  }

  const member = asRow<GroupMemberRow>(db
    .prepare('SELECT * FROM group_members WHERE group_id = ? AND phone = ?')
    .get(req.params.id, phone));

  res.status(201).json({
    member: {
      phone: member.phone,
      userId: member.user_id,
      name: member.name,
      status: member.status,
      role: member.role,
      invitedBy: member.invited_by,
      joinedAt: member.joined_at,
    },
  });
});

export default router;
