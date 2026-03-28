import { Router } from 'express';
import { getDb, asRow, asRows } from '../database/index.js';
import { requireAuth } from '../middleware/auth.js';
import { randomHex } from '../utils/id.js';
import type { GroupRow, GroupMemberRow, UserRow } from '../types/index.js';

const router = Router();

const INVITE_BASE_URL = process.env.INVITE_BASE_URL ?? 'http://localhost:5173/invite';
const INVITE_TTL_MS = (Number(process.env.INVITE_TOKEN_TTL_DAYS) || 7) * 86400 * 1000;

function buildInviteUrl(token: string) {
  return `${INVITE_BASE_URL}/${token}`;
}

// ── GET /invite/:token — public preview ───────────────────────────────────────
router.get('/:token', (req, res) => {
  const db = getDb();
  const now = Date.now();

  const row = asRow<GroupRow | undefined>(db
    .prepare('SELECT * FROM groups WHERE invite_token = ?')
    .get(req.params.token));

  if (!row) {
    res.status(404).json({ error: 'Invite link not found or expired' });
    return;
  }

  if (now - row.invite_token_created_at > INVITE_TTL_MS) {
    res.status(410).json({ error: 'Invite link has expired' });
    return;
  }

  const members = asRows<GroupMemberRow>(db
    .prepare("SELECT * FROM group_members WHERE group_id = ? AND status = 'active'")
    .all(row.id));

  res.json({
    group: {
      id: row.id,
      name: row.name,
      memberCount: members.length,
      createdAt: row.created_at,
    },
  });
});

// ── POST /invite/:token/join ───────────────────────────────────────────────────
router.post('/:token/join', requireAuth, (req, res) => {
  const db = getDb();
  const now = Date.now();

  const row = asRow<GroupRow | undefined>(db
    .prepare('SELECT * FROM groups WHERE invite_token = ?')
    .get(req.params.token));

  if (!row) {
    res.status(404).json({ error: 'Invite link not found' });
    return;
  }

  if (now - row.invite_token_created_at > INVITE_TTL_MS) {
    res.status(410).json({ error: 'Invite link has expired' });
    return;
  }

  const existing = asRow<GroupMemberRow | undefined>(db
    .prepare("SELECT * FROM group_members WHERE group_id = ? AND phone = ?")
    .get(row.id, req.userPhone!));

  if (existing && existing.status !== 'removed') {
    // Already a member — return group
    const members = asRows<GroupMemberRow>(db
      .prepare("SELECT * FROM group_members WHERE group_id = ? AND status != 'removed'")
      .all(row.id));

    res.json({
      group: {
        id: row.id,
        name: row.name,
        createdBy: row.created_by,
        createdAt: row.created_at,
        inviteToken: row.invite_token,
        inviteTokenCreatedAt: row.invite_token_created_at,
        members: members.map((m) => ({
          phone: m.phone, userId: m.user_id, name: m.name,
          status: m.status, role: m.role, invitedBy: m.invited_by, joinedAt: m.joined_at,
        })),
      },
      alreadyMember: true,
    });
    return;
  }

  const user = asRow<UserRow>(db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId!));

  if (existing) {
    db.prepare("UPDATE group_members SET status = 'active', user_id = ?, name = ?, joined_at = ? WHERE group_id = ? AND phone = ?")
      .run(user.id, user.name || user.phone, now, row.id, user.phone);
  } else {
    db.prepare(`
      INSERT INTO group_members (group_id, phone, user_id, name, status, role, invited_by, joined_at)
      VALUES (?, ?, ?, ?, 'active', 'member', 'invite', ?)
    `).run(row.id, user.phone, user.id, user.name || user.phone, now);
  }

  const members = asRows<GroupMemberRow>(db
    .prepare("SELECT * FROM group_members WHERE group_id = ? AND status != 'removed'")
    .all(row.id));

  res.json({
    group: {
      id: row.id, name: row.name, createdBy: row.created_by, createdAt: row.created_at,
      inviteToken: row.invite_token, inviteTokenCreatedAt: row.invite_token_created_at,
      members: members.map((m) => ({
        phone: m.phone, userId: m.user_id, name: m.name,
        status: m.status, role: m.role, invitedBy: m.invited_by, joinedAt: m.joined_at,
      })),
    },
    alreadyMember: false,
  });
});

// ── POST /groups/:id/invite/rotate ────────────────────────────────────────────
router.post('/groups/:id/rotate', requireAuth, (req, res) => {
  const db = getDb();
  const isAdmin = db
    .prepare("SELECT 1 FROM group_members WHERE group_id = ? AND phone = ? AND role = 'admin'")
    .get(req.params.id, req.userPhone!);

  if (!isAdmin) {
    res.status(403).json({ error: 'Only admins can rotate the invite link' });
    return;
  }

  const newToken = randomHex(16);
  const now = Date.now();
  db.prepare('UPDATE groups SET invite_token = ?, invite_token_created_at = ? WHERE id = ?')
    .run(newToken, now, req.params.id);

  res.json({ inviteToken: newToken, url: buildInviteUrl(newToken) });
});

export default router;
