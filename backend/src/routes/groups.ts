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

// ── Helpers ───────────────────────────────────────────────────────────────────

function serializeMember(m: GroupMemberRow) {
  return {
    phone: m.phone,
    userId: m.user_id,
    name: m.name,
    status: m.status,
    role: m.role,
    invitedBy: m.invited_by,
    joinedAt: m.joined_at != null ? toNum(m.joined_at) : null,
  };
}

function serializeGroup(row: GroupRow, members: GroupMemberRow[]) {
  return {
    id: row.id,
    name: row.name,
    type: row.type ?? 'group',
    createdBy: row.created_by,
    createdAt: toNum(row.created_at),
    inviteToken: row.invite_token,
    inviteTokenCreatedAt: toNum(row.invite_token_created_at),
    members: members.map(serializeMember),
  };
}

/** Single group — still one extra query, used after mutations. */
async function buildGroup(row: GroupRow) {
  const members = (await (await getRequest())
    .input('groupId', sql.NVarChar(36), row.id)
    .query("SELECT * FROM group_members WHERE group_id = @groupId AND status != 'removed'"))
    .recordset as GroupMemberRow[];
  return serializeGroup(row, members);
}

/** Batch build — fetches all members in a single query (no N+1). */
async function buildGroups(rows: GroupRow[]) {
  if (rows.length === 0) return [];
  const req = await getRequest();
  rows.forEach((r, i) => req.input(`gid${i}`, sql.NVarChar(36), r.id));
  const inList = rows.map((_, i) => `@gid${i}`).join(',');
  const allMembers = (await req.query(
    `SELECT * FROM group_members WHERE group_id IN (${inList}) AND status != 'removed'`
  )).recordset as GroupMemberRow[];

  const byGroup: Record<string, GroupMemberRow[]> = {};
  for (const m of allMembers) {
    if (!byGroup[m.group_id]) byGroup[m.group_id] = [];
    byGroup[m.group_id].push(m);
  }
  return rows.map((row) => serializeGroup(row, byGroup[row.id] ?? []));
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
// Only returns regular groups (type='group'). Direct friend groups are in /friends.
router.get('/', asyncHandler(async (req, res) => {
  const groupRows = (await (await getRequest())
    .input('phone', sql.NVarChar(20), req.userPhone!)
    .query(`
      SELECT g.* FROM groups g
      JOIN group_members gm ON gm.group_id = g.id
      WHERE gm.phone = @phone AND gm.status != 'removed' AND (g.type IS NULL OR g.type = 'group')
      ORDER BY g.created_at DESC
    `)).recordset as GroupRow[];

  const groups = await buildGroups(groupRows);
  res.json({ groups });
}));

// ── POST /groups ──────────────────────────────────────────────────────────────
router.post('/', validate(createGroupSchema), asyncHandler(async (req, res) => {
  const { name, members } = req.body as z.infer<typeof createGroupSchema>;
  const now = Date.now();
  const id = newId();
  const inviteToken = randomHex(16);

  const creatorResult = await (await getRequest())
    .input('id', sql.NVarChar(36), req.userId!)
    .query('SELECT * FROM users WHERE id = @id');
  const creator = creatorResult.recordset[0] as UserRow;

  if (!creator.phone) {
    res.status(400).json({ error: 'Please complete your profile setup (add phone number) before creating a group.' });
    return;
  }

  await withTransaction(async (t) => {
    await new sql.Request(t)
      .input('id',                   sql.NVarChar(36),  id)
      .input('name',                 sql.NVarChar(80),  name)
      .input('createdBy',            sql.NVarChar(36),  req.userId!)
      .input('inviteToken',          sql.NVarChar(40),  inviteToken)
      .input('inviteTokenCreatedAt', sql.BigInt,        now)
      .input('now',                  sql.BigInt,        now)
      .query(`
        INSERT INTO groups (id, name, created_by, invite_token, invite_token_created_at, created_at)
        VALUES (@id, @name, @createdBy, @inviteToken, @inviteTokenCreatedAt, @now)
      `);

    // Add creator as admin
    await new sql.Request(t)
      .input('groupId',   sql.NVarChar(36),  id)
      .input('phone',     sql.NVarChar(20),  creator.phone)
      .input('userId',    sql.NVarChar(36),  creator.id)
      .input('name',      sql.NVarChar(80),  creator.name)
      .input('invitedBy', sql.NVarChar(36),  creator.id)
      .input('joinedAt',  sql.BigInt,        now)
      .query(`
        INSERT INTO group_members (group_id, phone, user_id, name, status, role, invited_by, joined_at)
        VALUES (@groupId, @phone, @userId, @name, 'active', 'admin', @invitedBy, @joinedAt)
      `);

    // Add additional members
    for (const m of members) {
      if (m.phone === creator.phone) continue;

      const existingUserResult = await new sql.Request(t)
        .input('phone', sql.NVarChar(20), m.phone)
        .query('SELECT * FROM users WHERE phone = @phone');
      const existingUser = existingUserResult.recordset[0] as UserRow | undefined;

      const memberName = m.name || existingUser?.name || m.phone;
      const memberStatus = existingUser ? 'active' : 'pending';
      const memberUserId = existingUser?.id ?? null;
      const memberJoinedAt = existingUser ? now : null;

      const checkResult = await new sql.Request(t)
        .input('groupId', sql.NVarChar(36), id)
        .input('phone',   sql.NVarChar(20), m.phone)
        .query('SELECT 1 FROM group_members WHERE group_id = @groupId AND phone = @phone');

      if (checkResult.recordset.length > 0) continue; // skip duplicates

      const mReq = new sql.Request(t)
        .input('groupId',   sql.NVarChar(36),  id)
        .input('phone',     sql.NVarChar(20),  m.phone)
        .input('name',      sql.NVarChar(80),  memberName)
        .input('status',    sql.NVarChar(10),  memberStatus)
        .input('invitedBy', sql.NVarChar(36),  creator.id)
        .input('userId',    sql.NVarChar(36),  memberUserId)
        .input('joinedAt',  sql.BigInt,        memberJoinedAt);

      await mReq.query(`
        INSERT INTO group_members (group_id, phone, user_id, name, status, role, invited_by, joined_at)
        VALUES (@groupId, @phone, @userId, @name, @status, 'member', @invitedBy, @joinedAt)
      `);
    }
  });

  const groupRow = (await (await getRequest())
    .input('id', sql.NVarChar(36), id)
    .query('SELECT * FROM groups WHERE id = @id')).recordset[0] as GroupRow;

  res.status(201).json({ group: await buildGroup(groupRow) });
}));

// ── GET /groups/:id ───────────────────────────────────────────────────────────
router.get('/:id', asyncHandler(async (req, res) => {
  const membership = (await (await getRequest())
    .input('groupId', sql.NVarChar(36), req.params.id)
    .input('phone',   sql.NVarChar(20), req.userPhone!)
    .query("SELECT 1 FROM group_members WHERE group_id = @groupId AND phone = @phone AND status != 'removed'"))
    .recordset[0];

  if (!membership) {
    res.status(403).json({ error: 'Not a member of this group' });
    return;
  }

  const row = (await (await getRequest())
    .input('id', sql.NVarChar(36), req.params.id)
    .query('SELECT * FROM groups WHERE id = @id')).recordset[0] as GroupRow | undefined;

  if (!row) {
    res.status(404).json({ error: 'Group not found' });
    return;
  }

  res.json({ group: await buildGroup(row) });
}));

// ── PATCH /groups/:id ─────────────────────────────────────────────────────────
router.patch('/:id', validate(renameSchema), asyncHandler(async (req, res) => {
  const isAdmin = (await (await getRequest())
    .input('groupId', sql.NVarChar(36), req.params.id)
    .input('phone',   sql.NVarChar(20), req.userPhone!)
    .query("SELECT 1 FROM group_members WHERE group_id = @groupId AND phone = @phone AND role = 'admin'"))
    .recordset[0];

  if (!isAdmin) {
    res.status(403).json({ error: 'Only admins can rename the group' });
    return;
  }

  await (await getRequest())
    .input('name',    sql.NVarChar(80), req.body.name)
    .input('groupId', sql.NVarChar(36), req.params.id)
    .query('UPDATE groups SET name = @name WHERE id = @groupId');

  const row = (await (await getRequest())
    .input('id', sql.NVarChar(36), req.params.id)
    .query('SELECT * FROM groups WHERE id = @id')).recordset[0] as GroupRow;

  res.json({ group: await buildGroup(row) });
}));

// ── DELETE /groups/:id ────────────────────────────────────────────────────────
router.delete('/:id', asyncHandler(async (req, res) => {
  const group = (await (await getRequest())
    .input('id', sql.NVarChar(36), req.params.id)
    .query('SELECT * FROM groups WHERE id = @id')).recordset[0] as GroupRow | undefined;

  if (!group) {
    res.status(404).json({ error: 'Group not found' });
    return;
  }

  if (group.created_by !== req.userId!) {
    res.status(403).json({ error: 'Only the group creator can delete this group' });
    return;
  }

  await withTransaction(async (t) => {
    // Delete expense shares first (FK child of expenses) — use subquery (SQLite has no DELETE...JOIN)
    await new sql.Request(t)
      .input('groupId', sql.NVarChar(36), req.params.id)
      .query(`DELETE FROM expense_shares WHERE expense_id IN (SELECT id FROM expenses WHERE group_id = @groupId)`);
    await new sql.Request(t)
      .input('groupId', sql.NVarChar(36), req.params.id)
      .query('DELETE FROM expenses WHERE group_id = @groupId');
    await new sql.Request(t)
      .input('groupId', sql.NVarChar(36), req.params.id)
      .query('DELETE FROM payments WHERE group_id = @groupId');
    await new sql.Request(t)
      .input('groupId', sql.NVarChar(36), req.params.id)
      .query('DELETE FROM group_members WHERE group_id = @groupId');
    await new sql.Request(t)
      .input('groupId', sql.NVarChar(36), req.params.id)
      .query('DELETE FROM groups WHERE id = @groupId');
  });

  res.status(200).json({ message: 'Group deleted' });
}));

// ── POST /groups/:id/members ──────────────────────────────────────────────────
router.post('/:id/members', validate(memberSchema), asyncHandler(async (req, res) => {
  const { phone, name } = req.body as z.infer<typeof memberSchema>;
  const now = Date.now();

  // Verify requester is an active member
  const membership = (await (await getRequest())
    .input('groupId', sql.NVarChar(36), req.params.id)
    .input('phone',   sql.NVarChar(20), req.userPhone!)
    .query("SELECT 1 FROM group_members WHERE group_id = @groupId AND phone = @phone AND status = 'active'"))
    .recordset[0];

  if (!membership) {
    res.status(403).json({ error: 'Not a member of this group' });
    return;
  }

  const existingUser = (await (await getRequest())
    .input('phone', sql.NVarChar(20), phone)
    .query('SELECT * FROM users WHERE phone = @phone')).recordset[0] as UserRow | undefined;

  const existing = (await (await getRequest())
    .input('groupId', sql.NVarChar(36), req.params.id)
    .input('phone',   sql.NVarChar(20), phone)
    .query('SELECT * FROM group_members WHERE group_id = @groupId AND phone = @phone'))
    .recordset[0] as GroupMemberRow | undefined;

  if (existing) {
    if (existing.status === 'removed') {
      const newStatus = existingUser ? 'active' : 'pending';
      const newUserId = existingUser?.id ?? existing.user_id;
      const newName   = name || existingUser?.name || phone;
      const newJoined = existingUser ? now : null;

      const uReq = (await getRequest())
        .input('status',   sql.NVarChar(10), newStatus)
        .input('name',     sql.NVarChar(80), newName)
        .input('groupId',  sql.NVarChar(36), req.params.id)
        .input('phone',    sql.NVarChar(20), phone)
        .input('userId',   sql.NVarChar(36), newUserId)
        .input('joinedAt', sql.BigInt,       newJoined);

      await uReq.query(`
        UPDATE group_members
        SET status = @status, user_id = @userId, name = @name, joined_at = @joinedAt
        WHERE group_id = @groupId AND phone = @phone
      `);
    } else {
      res.status(409).json({ error: 'Member already in group' });
      return;
    }
  } else {
    const memberName   = name || existingUser?.name || phone;
    const memberStatus = existingUser ? 'active' : 'pending';
    const memberUserId = existingUser?.id ?? null;
    const memberJoined = existingUser ? now : null;

    const iReq = (await getRequest())
      .input('groupId',   sql.NVarChar(36), req.params.id)
      .input('phone',     sql.NVarChar(20), phone)
      .input('name',      sql.NVarChar(80), memberName)
      .input('status',    sql.NVarChar(10), memberStatus)
      .input('invitedBy', sql.NVarChar(36), req.userId!)
      .input('userId',    sql.NVarChar(36), memberUserId)
      .input('joinedAt',  sql.BigInt,       memberJoined);

    await iReq.query(`
      INSERT INTO group_members (group_id, phone, user_id, name, status, role, invited_by, joined_at)
      VALUES (@groupId, @phone, @userId, @name, @status, 'member', @invitedBy, @joinedAt)
    `);
  }

  const member = (await (await getRequest())
    .input('groupId', sql.NVarChar(36), req.params.id)
    .input('phone',   sql.NVarChar(20), phone)
    .query('SELECT * FROM group_members WHERE group_id = @groupId AND phone = @phone'))
    .recordset[0] as GroupMemberRow;

  res.status(201).json({
    member: {
      phone: member.phone,
      userId: member.user_id,
      name: member.name,
      status: member.status,
      role: member.role,
      invitedBy: member.invited_by,
      joinedAt: member.joined_at != null ? toNum(member.joined_at) : null,
    },
  });
}));

// ── POST /groups/:id/invite/rotate ────────────────────────────────────────────
router.post('/:id/invite/rotate', asyncHandler(async (req, res) => {
  const isAdmin = (await (await getRequest())
    .input('groupId', sql.NVarChar(36), req.params.id)
    .input('phone',   sql.NVarChar(20), req.userPhone!)
    .query("SELECT 1 FROM group_members WHERE group_id = @groupId AND phone = @phone AND role = 'admin'"))
    .recordset[0];

  if (!isAdmin) {
    res.status(403).json({ error: 'Only admins can rotate the invite link' });
    return;
  }

  const newToken = randomHex(16);
  const now = Date.now();

  await (await getRequest())
    .input('token',   sql.NVarChar(40), newToken)
    .input('now',     sql.BigInt,       now)
    .input('groupId', sql.NVarChar(36), req.params.id)
    .query('UPDATE groups SET invite_token = @token, invite_token_created_at = @now WHERE id = @groupId');

  res.json({ inviteToken: newToken });
}));

export default router;
