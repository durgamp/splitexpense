import { Router, type Request } from 'express';
import { z } from 'zod';
import { getRequest, withTransaction, toNum, sql } from '../database/index.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { newId } from '../utils/id.js';
import { buildSplitMap, validateShares } from '../utils/balance.js';
import type { ExpenseRow, ExpenseShareRow } from '../types/index.js';

type GroupParams = { id: string };
type ExpenseParams = { id: string; eid: string };

const router = Router({ mergeParams: true });
router.use(requireAuth);

const CATEGORIES = ['food', 'transport', 'accommodation', 'entertainment', 'utilities', 'shopping', 'other'] as const;
const SPLIT_TYPES = ['equal', 'exact', 'percentage', 'shares'] as const;

const customSplitItem = z.object({
  phone: z.string().regex(/^\+[1-9]\d{6,14}$/),
  value: z.number().positive(),
});

const expenseSchema = z.object({
  description: z.string().min(1).max(200).trim(),
  amountRupees: z.number().positive().max(10_000_000),
  paidByPhone: z.string().regex(/^\+[1-9]\d{6,14}$/),
  participantPhones: z.array(z.string().regex(/^\+[1-9]\d{6,14}$/)).min(1).max(20),
  category: z.enum(CATEGORIES).default('other'),
  splitType: z.enum(SPLIT_TYPES).default('equal'),
  splits: z.array(customSplitItem).optional(),
  notes: z.string().max(500).trim().optional(),
});

const editSchema = expenseSchema.partial();

// ── Helpers ───────────────────────────────────────────────────────────────────

async function buildExpense(row: ExpenseRow) {
  const shares = (await (await getRequest())
    .input('expenseId', sql.NVarChar(36), row.id)
    .query('SELECT * FROM expense_shares WHERE expense_id = @expenseId'))
    .recordset as ExpenseShareRow[];

  return {
    id: row.id,
    groupId: row.group_id,
    description: row.description,
    amountPaise: toNum(row.amount_paise),
    paidByPhone: row.paid_by_phone,
    category: row.category,
    splitType: row.split_type ?? 'equal',
    notes: row.notes ?? null,
    createdBy: row.created_by,
    createdAt: toNum(row.created_at),
    updatedAt: toNum(row.updated_at),
    deletedAt: row.deleted_at != null ? toNum(row.deleted_at) : null,
    shares: shares.map((s) => ({ phone: s.phone, amountPaise: toNum(s.amount_paise) })),
  };
}

async function assertMember(groupId: string, phone: string): Promise<boolean> {
  const result = await (await getRequest())
    .input('groupId', sql.NVarChar(36), groupId)
    .input('phone',   sql.NVarChar(20), phone)
    .query("SELECT 1 AS one FROM group_members WHERE group_id = @groupId AND phone = @phone AND status = 'active'");
  return result.recordset.length > 0;
}

// ── GET /groups/:id/expenses ──────────────────────────────────────────────────
router.get('/', asyncHandler(async (req: Request<GroupParams>, res) => {
  if (!(await assertMember(req.params.id, req.userPhone!))) {
    res.status(403).json({ error: 'Not a member of this group' });
    return;
  }

  const rows = (await (await getRequest())
    .input('groupId', sql.NVarChar(36), req.params.id)
    .query('SELECT * FROM expenses WHERE group_id = @groupId AND deleted_at IS NULL ORDER BY created_at DESC'))
    .recordset as ExpenseRow[];

  const expenses = await Promise.all(rows.map(buildExpense));
  res.json({ expenses });
}));

// ── POST /groups/:id/expenses ─────────────────────────────────────────────────
router.post('/', validate(expenseSchema), asyncHandler(async (req: Request<GroupParams>, res) => {
  const body = req.body as z.infer<typeof expenseSchema>;

  if (!(await assertMember(req.params.id, req.userPhone!))) {
    res.status(403).json({ error: 'Not a member of this group' });
    return;
  }
  if (!(await assertMember(req.params.id, body.paidByPhone))) {
    res.status(400).json({ error: 'Paid-by person is not an active group member' });
    return;
  }

  const amountPaise = Math.round(body.amountRupees * 100);
  const splitMap = buildSplitMap(body.splitType, amountPaise, body.participantPhones, body.splits);

  if (!splitMap) {
    res.status(400).json({ error: 'Invalid split — amounts must sum to the total expense amount.' });
    return;
  }
  if (!validateShares(amountPaise, splitMap)) {
    res.status(400).json({ error: 'Split amounts do not add up to the total.' });
    return;
  }

  const id = newId();
  const now = Date.now();

  await withTransaction(async (t) => {
    await new sql.Request(t)
      .input('id',          sql.NVarChar(36),  id)
      .input('groupId',     sql.NVarChar(36),  req.params.id)
      .input('description', sql.NVarChar(200), body.description)
      .input('amountPaise', sql.BigInt,        BigInt(amountPaise))
      .input('paidByPhone', sql.NVarChar(20),  body.paidByPhone)
      .input('category',    sql.NVarChar(30),  body.category)
      .input('splitType',   sql.NVarChar(20),  body.splitType)
      .input('notes',       sql.NVarChar(500), body.notes ?? null as unknown as string)
      .input('createdBy',   sql.NVarChar(36),  req.userId!)
      .input('now',         sql.BigInt,        BigInt(now))
      .query(`
        INSERT INTO expenses
          (id, group_id, description, amount_paise, paid_by_phone, category, split_type, notes, created_by, created_at, updated_at, deleted_at)
        VALUES (@id, @groupId, @description, @amountPaise, @paidByPhone, @category, @splitType, @notes, @createdBy, @now, @now, NULL)
      `);

    for (const [phone, amount] of Object.entries(splitMap)) {
      await new sql.Request(t)
        .input('expenseId',   sql.NVarChar(36), id)
        .input('phone',       sql.NVarChar(20), phone)
        .input('amountPaise', sql.BigInt,       BigInt(amount))
        .query('INSERT INTO expense_shares (expense_id, phone, amount_paise) VALUES (@expenseId, @phone, @amountPaise)');
    }
  });

  const row = (await (await getRequest())
    .input('id', sql.NVarChar(36), id)
    .query('SELECT * FROM expenses WHERE id = @id')).recordset[0] as ExpenseRow;

  res.status(201).json({ expense: await buildExpense(row) });
}));

// ── PUT /groups/:id/expenses/:eid ─────────────────────────────────────────────
router.put('/:eid', validate(editSchema), asyncHandler(async (req: Request<ExpenseParams>, res) => {
  const body = req.body as z.infer<typeof editSchema>;

  const existing = (await (await getRequest())
    .input('eid',     sql.NVarChar(36), req.params.eid)
    .input('groupId', sql.NVarChar(36), req.params.id)
    .query('SELECT * FROM expenses WHERE id = @eid AND group_id = @groupId AND deleted_at IS NULL'))
    .recordset[0] as ExpenseRow | undefined;

  if (!existing) { res.status(404).json({ error: 'Expense not found' }); return; }
  if (existing.created_by !== req.userId!) {
    res.status(403).json({ error: 'Only the creator can edit this expense' });
    return;
  }

  const amountPaise = body.amountRupees != null
    ? Math.round(body.amountRupees * 100) : toNum(existing.amount_paise);

  let participants = body.participantPhones;
  if (!participants) {
    const shareRows = (await (await getRequest())
      .input('expenseId', sql.NVarChar(36), existing.id)
      .query('SELECT phone FROM expense_shares WHERE expense_id = @expenseId'))
      .recordset as { phone: string }[];
    participants = shareRows.map((r) => r.phone);
  }

  const splitType = body.splitType ?? (existing.split_type as 'equal' | 'exact' | 'percentage' | 'shares') ?? 'equal';
  const splitMap = buildSplitMap(splitType, amountPaise, participants, body.splits);

  if (!splitMap) {
    res.status(400).json({ error: 'Invalid split — amounts must sum to the total expense amount.' });
    return;
  }

  const now = Date.now();

  await withTransaction(async (t) => {
    await new sql.Request(t)
      .input('description', sql.NVarChar(200), body.description ?? existing.description)
      .input('amountPaise', sql.BigInt,        BigInt(amountPaise))
      .input('paidByPhone', sql.NVarChar(20),  body.paidByPhone ?? existing.paid_by_phone)
      .input('category',    sql.NVarChar(30),  body.category ?? existing.category)
      .input('splitType',   sql.NVarChar(20),  splitType)
      .input('notes',       sql.NVarChar(500), body.notes !== undefined ? (body.notes ?? null as unknown as string) : (existing.notes ?? null as unknown as string))
      .input('updatedAt',   sql.BigInt,        BigInt(now))
      .input('id',          sql.NVarChar(36),  existing.id)
      .query(`
        UPDATE expenses SET
          description = @description, amount_paise = @amountPaise, paid_by_phone = @paidByPhone,
          category = @category, split_type = @splitType, notes = @notes, updated_at = @updatedAt
        WHERE id = @id
      `);

    await new sql.Request(t)
      .input('expenseId', sql.NVarChar(36), existing.id)
      .query('DELETE FROM expense_shares WHERE expense_id = @expenseId');

    for (const [phone, amount] of Object.entries(splitMap)) {
      await new sql.Request(t)
        .input('expenseId',   sql.NVarChar(36), existing.id)
        .input('phone',       sql.NVarChar(20), phone)
        .input('amountPaise', sql.BigInt,       BigInt(amount))
        .query('INSERT INTO expense_shares (expense_id, phone, amount_paise) VALUES (@expenseId, @phone, @amountPaise)');
    }
  });

  const row = (await (await getRequest())
    .input('id', sql.NVarChar(36), existing.id)
    .query('SELECT * FROM expenses WHERE id = @id')).recordset[0] as ExpenseRow;

  res.json({ expense: await buildExpense(row) });
}));

// ── DELETE /groups/:id/expenses/:eid ──────────────────────────────────────────
router.delete('/:eid', asyncHandler(async (req: Request<ExpenseParams>, res) => {
  const existing = (await (await getRequest())
    .input('eid',     sql.NVarChar(36), req.params.eid)
    .input('groupId', sql.NVarChar(36), req.params.id)
    .query('SELECT * FROM expenses WHERE id = @eid AND group_id = @groupId AND deleted_at IS NULL'))
    .recordset[0] as ExpenseRow | undefined;

  if (!existing) { res.status(404).json({ error: 'Expense not found' }); return; }

  if (existing.created_by !== req.userId!) {
    const isAdmin = (await (await getRequest())
      .input('groupId', sql.NVarChar(36), req.params.id)
      .input('phone',   sql.NVarChar(20), req.userPhone!)
      .query("SELECT 1 FROM group_members WHERE group_id = @groupId AND phone = @phone AND role = 'admin'"))
      .recordset[0];
    if (!isAdmin) {
      res.status(403).json({ error: 'Only the creator or a group admin can delete expenses' });
      return;
    }
  }

  const now = Date.now();
  await (await getRequest())
    .input('deletedAt', sql.BigInt,       BigInt(now))
    .input('updatedAt', sql.BigInt,       BigInt(now))
    .input('id',        sql.NVarChar(36), existing.id)
    .query('UPDATE expenses SET deleted_at = @deletedAt, updated_at = @updatedAt WHERE id = @id');

  res.json({ success: true });
}));

export default router;
