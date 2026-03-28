import { Router, type Request } from 'express';
import { z } from 'zod';
import { getDb, asRow, asRows } from '../database/index.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { newId } from '../utils/id.js';
import { splitEqually, validateShares } from '../utils/balance.js';
import type { ExpenseRow, ExpenseShareRow } from '../types/index.js';

// mergeParams: true brings in the parent `:id` param at runtime; type it here
type GroupParams = { id: string };
type ExpenseParams = { id: string; eid: string };

const router = Router({ mergeParams: true });
router.use(requireAuth);

const CATEGORIES = ['food', 'transport', 'accommodation', 'entertainment', 'utilities', 'shopping', 'other'] as const;

const expenseSchema = z.object({
  description: z.string().min(1).max(200).trim(),
  amountRupees: z.number().positive().max(10_000_000),
  paidByPhone: z.string().regex(/^\+[1-9]\d{6,14}$/),
  participantPhones: z.array(z.string().regex(/^\+[1-9]\d{6,14}$/)).min(1).max(20),
  category: z.enum(CATEGORIES).default('other'),
});

const editSchema = expenseSchema.partial();

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildExpense(row: ExpenseRow, db: ReturnType<typeof getDb>) {
  const shares = asRows<ExpenseShareRow>(db
    .prepare('SELECT * FROM expense_shares WHERE expense_id = ?')
    .all(row.id));

  return {
    id: row.id,
    groupId: row.group_id,
    description: row.description,
    amountPaise: row.amount_paise,
    paidByPhone: row.paid_by_phone,
    category: row.category,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    shares: shares.map((s) => ({ phone: s.phone, amountPaise: s.amount_paise })),
  };
}

function assertMember(db: ReturnType<typeof getDb>, groupId: string, phone: string): boolean {
  return !!db
    .prepare("SELECT 1 FROM group_members WHERE group_id = ? AND phone = ? AND status = 'active'")
    .get(groupId, phone);
}

// ── GET /groups/:id/expenses ──────────────────────────────────────────────────
router.get('/', (req: Request<GroupParams>, res) => {
  const db = getDb();
  if (!assertMember(db, req.params.id, req.userPhone!)) {
    res.status(403).json({ error: 'Not a member of this group' });
    return;
  }

  const rows = asRows<ExpenseRow>(db
    .prepare('SELECT * FROM expenses WHERE group_id = ? AND deleted_at IS NULL ORDER BY created_at DESC')
    .all(req.params.id));

  res.json({ expenses: rows.map((r) => buildExpense(r, db)) });
});

// ── POST /groups/:id/expenses ─────────────────────────────────────────────────
router.post('/', validate(expenseSchema), (req: Request<GroupParams>, res) => {
  const body = req.body as z.infer<typeof expenseSchema>;
  const db = getDb();
  if (!assertMember(db, req.params.id, req.userPhone!)) {
    res.status(403).json({ error: 'Not a member of this group' });
    return;
  }

  // Validate paidByPhone is an active group member
  if (!assertMember(db, req.params.id, body.paidByPhone)) {
    res.status(400).json({ error: 'Paid-by person is not an active group member' });
    return;
  }

  const amountPaise = Math.round(body.amountRupees * 100);
  const splitMap = splitEqually(amountPaise, body.participantPhones);

  if (!validateShares(amountPaise, splitMap)) {
    res.status(500).json({ error: 'Share calculation error' });
    return;
  }

  const id = newId();
  const now = Date.now();

  db.exec('BEGIN');
  try {
    db.prepare(`
      INSERT INTO expenses (id, group_id, description, amount_paise, paid_by_phone, category, created_by, created_at, updated_at, deleted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
    `).run(id, req.params.id, body.description, amountPaise, body.paidByPhone, body.category, req.userId!, now, now);

    for (const [phone, amount] of Object.entries(splitMap)) {
      db.prepare('INSERT INTO expense_shares (expense_id, phone, amount_paise) VALUES (?, ?, ?)')
        .run(id, phone, amount);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  const row = asRow<ExpenseRow>(db.prepare('SELECT * FROM expenses WHERE id = ?').get(id));
  res.status(201).json({ expense: buildExpense(row, db) });
});

// ── PUT /groups/:id/expenses/:eid ─────────────────────────────────────────────
router.put('/:eid', validate(editSchema), (req: Request<ExpenseParams>, res) => {
  const body = req.body as z.infer<typeof editSchema>;
  const db = getDb();

  const existing = asRow<ExpenseRow | undefined>(db
    .prepare('SELECT * FROM expenses WHERE id = ? AND group_id = ? AND deleted_at IS NULL')
    .get(req.params.eid, req.params.id));

  if (!existing) {
    res.status(404).json({ error: 'Expense not found' });
    return;
  }

  if (existing.created_by !== req.userId!) {
    res.status(403).json({ error: 'Only the creator can edit this expense' });
    return;
  }

  const amountPaise = body.amountRupees != null
    ? Math.round(body.amountRupees * 100)
    : existing.amount_paise;

  const participants = body.participantPhones ??
    asRows<{ phone: string }>(db.prepare('SELECT phone FROM expense_shares WHERE expense_id = ?')
      .all(existing.id)).map((r) => r.phone);

  const splitMap = splitEqually(amountPaise, participants);
  const now = Date.now();

  db.exec('BEGIN');
  try {
    db.prepare(`
      UPDATE expenses SET
        description = ?, amount_paise = ?, paid_by_phone = ?, category = ?, updated_at = ?
      WHERE id = ?
    `).run(
      body.description ?? existing.description,
      amountPaise,
      body.paidByPhone ?? existing.paid_by_phone,
      body.category ?? existing.category,
      now,
      existing.id,
    );

    db.prepare('DELETE FROM expense_shares WHERE expense_id = ?').run(existing.id);
    for (const [phone, amount] of Object.entries(splitMap)) {
      db.prepare('INSERT INTO expense_shares (expense_id, phone, amount_paise) VALUES (?, ?, ?)')
        .run(existing.id, phone, amount);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  const row = asRow<ExpenseRow>(db.prepare('SELECT * FROM expenses WHERE id = ?').get(existing.id));
  res.json({ expense: buildExpense(row, db) });
});

// ── DELETE /groups/:id/expenses/:eid ──────────────────────────────────────────
router.delete('/:eid', (req: Request<ExpenseParams>, res) => {
  const db = getDb();
  const existing = asRow<ExpenseRow | undefined>(db
    .prepare('SELECT * FROM expenses WHERE id = ? AND group_id = ? AND deleted_at IS NULL')
    .get(req.params.eid, req.params.id));

  if (!existing) {
    res.status(404).json({ error: 'Expense not found' });
    return;
  }

  if (existing.created_by !== req.userId!) {
    const isAdmin = db
      .prepare("SELECT 1 FROM group_members WHERE group_id = ? AND phone = ? AND role = 'admin'")
      .get(req.params.id, req.userPhone!);
    if (!isAdmin) {
      res.status(403).json({ error: 'Only the creator or a group admin can delete expenses' });
      return;
    }
  }

  db.prepare('UPDATE expenses SET deleted_at = ?, updated_at = ? WHERE id = ?')
    .run(Date.now(), Date.now(), existing.id);

  res.json({ success: true });
});

export default router;
