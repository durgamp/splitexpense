/**
 * Friends — non-group (direct) expense connections between two users.
 * Backed by a groups row with type='direct'. Only 2 members allowed.
 * Direct groups are hidden from the main /groups list.
 */
import { Router } from 'express';
import { z } from 'zod';
import { getRequest, withTransaction, toNum, sql } from '../database/index.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { newId, randomHex } from '../utils/id.js';
import type { GroupRow, GroupMemberRow, UserRow } from '../types/index.js';

const router = Router();
router.use(requireAuth);

const addFriendSchema = z.object({
  phone: z.string().regex(/^\+[1-9]\d{6,14}$/, 'Invalid phone number'),
  name: z.string().min(1).max(80).trim(),
});

async function buildGroup(row: GroupRow) {
  const members = (await (await getRequest())
    .input('groupId', sql.NVarChar(36), row.id)
    .query("SELECT * FROM group_members WHERE group_id = @groupId AND status != 'removed'"))
    .recordset as GroupMemberRow[];

  return {
    id: row.id,
    name: row.name,
    type: row.type,
    createdBy: row.created_by,
    createdAt: toNum(row.created_at),
    inviteToken: row.invite_token,
    inviteTokenCreatedAt: toNum(row.invite_token_created_at),
    members: members.map((m) => ({
      phone: m.phone, userId: m.user_id, name: m.name,
      status: m.status, role: m.role, invitedBy: m.invited_by,
      joinedAt: m.joined_at != null ? toNum(m.joined_at) : null,
    })),
  };
}

// ── GET /friends ──────────────────────────────────────────────────────────────
router.get('/', asyncHandler(async (req, res) => {
  const rows = (await (await getRequest())
    .input('phone', sql.NVarChar(20), req.userPhone!)
    .query(`
      SELECT g.* FROM groups g
      JOIN group_members gm ON gm.group_id = g.id
      WHERE gm.phone = @phone AND gm.status != 'removed' AND g.type = 'direct'
      ORDER BY g.created_at DESC
    `)).recordset as GroupRow[];

  const friends = await Promise.all(rows.map(buildGroup));
  res.json({ friends });
}));

// ── POST /friends ─────────────────────────────────────────────────────────────
router.post('/', validate(addFriendSchema), asyncHandler(async (req, res) => {
  const { phone, name } = req.body as z.infer<typeof addFriendSchema>;
  const now = Date.now();

  if (phone === req.userPhone!) {
    res.status(400).json({ error: 'Cannot add yourself as a friend' });
    return;
  }

  // Check if a direct group already exists between these two users
  const existing = (await (await getRequest())
    .input('myPhone',     sql.NVarChar(20), req.userPhone!)
    .input('friendPhone', sql.NVarChar(20), phone)
    .query(`
      SELECT g.* FROM groups g
      JOIN group_members gm1 ON gm1.group_id = g.id AND gm1.phone = @myPhone
      JOIN group_members gm2 ON gm2.group_id = g.id AND gm2.phone = @friendPhone
      WHERE g.type = 'direct'
      LIMIT 1
    `)).recordset[0] as GroupRow | undefined;

  if (existing) {
    res.status(409).json({ error: 'You already have a direct connection with this person', groupId: existing.id });
    return;
  }

  const creatorResult = await (await getRequest())
    .input('id', sql.NVarChar(36), req.userId!)
    .query('SELECT * FROM users WHERE id = @id');
  const creator = creatorResult.recordset[0] as UserRow;

  const friendUserResult = await (await getRequest())
    .input('phone', sql.NVarChar(20), phone)
    .query('SELECT * FROM users WHERE phone = @phone');
  const friendUser = friendUserResult.recordset[0] as UserRow | undefined;

  const id = newId();
  const inviteToken = randomHex(16);

  await withTransaction(async (t) => {
    await new sql.Request(t)
      .input('id',                   sql.NVarChar(36), id)
      .input('name',                 sql.NVarChar(80), name)
      .input('createdBy',            sql.NVarChar(36), req.userId!)
      .input('inviteToken',          sql.NVarChar(40), inviteToken)
      .input('inviteTokenCreatedAt', sql.BigInt,       now)
      .input('now',                  sql.BigInt,       now)
      .query(`
        INSERT INTO groups (id, name, type, created_by, invite_token, invite_token_created_at, created_at)
        VALUES (@id, @name, 'direct', @createdBy, @inviteToken, @inviteTokenCreatedAt, @now)
      `);

    // Creator
    await new sql.Request(t)
      .input('groupId',   sql.NVarChar(36), id)
      .input('phone',     sql.NVarChar(20), creator.phone)
      .input('userId',    sql.NVarChar(36), creator.id)
      .input('name',      sql.NVarChar(80), creator.name)
      .input('invitedBy', sql.NVarChar(36), creator.id)
      .input('joinedAt',  sql.BigInt,       now)
      .query(`
        INSERT INTO group_members (group_id, phone, user_id, name, status, role, invited_by, joined_at)
        VALUES (@groupId, @phone, @userId, @name, 'active', 'admin', @invitedBy, @joinedAt)
      `);

    // Friend
    const friendName   = name || friendUser?.name || phone;
    const friendStatus = friendUser ? 'active' : 'pending';
    const friendUserId = friendUser?.id ?? null;
    const friendJoined = friendUser ? now : null;

    const fReq = new sql.Request(t)
      .input('groupId',   sql.NVarChar(36), id)
      .input('phone',     sql.NVarChar(20), phone)
      .input('name',      sql.NVarChar(80), friendName)
      .input('status',    sql.NVarChar(10), friendStatus)
      .input('invitedBy', sql.NVarChar(36), creator.id)
      .input('userId',    sql.NVarChar(36), friendUserId)
      .input('joinedAt',  sql.BigInt,       friendJoined);

    await fReq.query(`
      INSERT INTO group_members (group_id, phone, user_id, name, status, role, invited_by, joined_at)
      VALUES (@groupId, @phone, @userId, @name, @status, 'member', @invitedBy, @joinedAt)
    `);
  });

  const row = (await (await getRequest())
    .input('id', sql.NVarChar(36), id)
    .query('SELECT * FROM groups WHERE id = @id')).recordset[0] as GroupRow;

  res.status(201).json({ friend: await buildGroup(row) });
}));

export default router;
