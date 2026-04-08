import { Router } from 'express';
import { getRequest, toNum, sql } from '../database/index.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import type { GroupRow, GroupMemberRow, UserRow } from '../types/index.js';

const router = Router();

const INVITE_TTL_MS = (Number(process.env.INVITE_TOKEN_TTL_DAYS) || 7) * 86400 * 1000;

// ── GET /invite/:token — public preview ───────────────────────────────────────
router.get('/:token', asyncHandler(async (req, res) => {
  const now = Date.now();

  const row = (await (await getRequest())
    .input('token', sql.NVarChar(40), req.params.token)
    .query('SELECT * FROM groups WHERE invite_token = @token'))
    .recordset[0] as GroupRow | undefined;

  if (!row) {
    res.status(404).json({ error: 'Invite link not found or expired' });
    return;
  }

  if (now - toNum(row.invite_token_created_at) > INVITE_TTL_MS) {
    res.status(410).json({ error: 'Invite link has expired' });
    return;
  }

  const members = (await (await getRequest())
    .input('groupId', sql.NVarChar(36), row.id)
    .query("SELECT * FROM group_members WHERE group_id = @groupId AND status = 'active'"))
    .recordset as GroupMemberRow[];

  res.json({
    group: {
      id: row.id,
      name: row.name,
      memberCount: members.length,
      createdAt: toNum(row.created_at),
    },
  });
}));

// ── POST /invite/:token/join ───────────────────────────────────────────────────
router.post('/:token/join', requireAuth, asyncHandler(async (req, res) => {
  const now = Date.now();

  const row = (await (await getRequest())
    .input('token', sql.NVarChar(40), req.params.token)
    .query('SELECT * FROM groups WHERE invite_token = @token'))
    .recordset[0] as GroupRow | undefined;

  if (!row) {
    res.status(404).json({ error: 'Invite link not found' });
    return;
  }

  if (now - toNum(row.invite_token_created_at) > INVITE_TTL_MS) {
    res.status(410).json({ error: 'Invite link has expired' });
    return;
  }

  const existing = (await (await getRequest())
    .input('groupId', sql.NVarChar(36), row.id)
    .input('phone',   sql.NVarChar(20), req.userPhone!)
    .query('SELECT * FROM group_members WHERE group_id = @groupId AND phone = @phone'))
    .recordset[0] as GroupMemberRow | undefined;

  function buildMembers(members: GroupMemberRow[]) {
    return members.map((m) => ({
      phone: m.phone, userId: m.user_id, name: m.name,
      status: m.status, role: m.role, invitedBy: m.invited_by,
      joinedAt: m.joined_at != null ? toNum(m.joined_at) : null,
    }));
  }

  if (existing && existing.status !== 'removed') {
    const members = (await (await getRequest())
      .input('groupId', sql.NVarChar(36), row.id)
      .query("SELECT * FROM group_members WHERE group_id = @groupId AND status != 'removed'"))
      .recordset as GroupMemberRow[];

    res.json({
      group: {
        id: row.id, name: row.name, createdBy: row.created_by,
        createdAt: toNum(row.created_at), inviteToken: row.invite_token,
        inviteTokenCreatedAt: toNum(row.invite_token_created_at),
        members: buildMembers(members),
      },
      alreadyMember: true,
    });
    return;
  }

  const user = (await (await getRequest())
    .input('id', sql.NVarChar(36), req.userId!)
    .query('SELECT * FROM users WHERE id = @id'))
    .recordset[0] as UserRow;

  if (!user.phone) {
    res.status(400).json({ error: 'Please complete your profile setup (add phone number) before joining a group.' });
    return;
  }

  const displayName = user.name || user.phone;

  if (existing) {
    await (await getRequest())
      .input('userId',  sql.NVarChar(36), user.id)
      .input('name',    sql.NVarChar(80), displayName)
      .input('joinedAt',sql.BigInt,       now)
      .input('groupId', sql.NVarChar(36), row.id)
      .input('phone',   sql.NVarChar(20), user.phone)
      .query("UPDATE group_members SET status = 'active', user_id = @userId, name = @name, joined_at = @joinedAt WHERE group_id = @groupId AND phone = @phone");
  } else {
    await (await getRequest())
      .input('groupId',  sql.NVarChar(36), row.id)
      .input('phone',    sql.NVarChar(20), user.phone)
      .input('userId',   sql.NVarChar(36), user.id)
      .input('name',     sql.NVarChar(80), displayName)
      .input('joinedAt', sql.BigInt,       now)
      .query(`
        INSERT INTO group_members (group_id, phone, user_id, name, status, role, invited_by, joined_at)
        VALUES (@groupId, @phone, @userId, @name, 'active', 'member', 'invite', @joinedAt)
      `);
  }

  const members = (await (await getRequest())
    .input('groupId', sql.NVarChar(36), row.id)
    .query("SELECT * FROM group_members WHERE group_id = @groupId AND status != 'removed'"))
    .recordset as GroupMemberRow[];

  res.json({
    group: {
      id: row.id, name: row.name, createdBy: row.created_by,
      createdAt: toNum(row.created_at), inviteToken: row.invite_token,
      inviteTokenCreatedAt: toNum(row.invite_token_created_at),
      members: buildMembers(members),
    },
    alreadyMember: false,
  });
}));

export default router;
