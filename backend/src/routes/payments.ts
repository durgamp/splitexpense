import { Router, type Request } from 'express';
import { z } from 'zod';
import { getDb, asRow, asRows } from '../database/index.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { newId } from '../utils/id.js';
import type { PaymentRow } from '../types/index.js';

type GroupParams = { id: string };
type PaymentParams = { id: string; pid: string };

const router = Router({ mergeParams: true });
router.use(requireAuth);

const paymentSchema = z.object({
  fromPhone: z.string().regex(/^\+[1-9]\d{6,14}$/),
  toPhone: z.string().regex(/^\+[1-9]\d{6,14}$/),
  amountRupees: z.number().positive().max(10_000_000),
  notes: z.string().max(200).trim().optional(),
});

function buildPayment(row: PaymentRow) {
  return {
    id: row.id,
    groupId: row.group_id,
    fromPhone: row.from_phone,
    toPhone: row.to_phone,
    amountPaise: row.amount_paise,
    notes: row.notes ?? null,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

function assertMember(db: ReturnType<typeof getDb>, groupId: string, phone: string): boolean {
  return !!db
    .prepare("SELECT 1 FROM group_members WHERE group_id = ? AND phone = ? AND status = 'active'")
    .get(groupId, phone);
}

// ── GET /groups/:id/payments ──────────────────────────────────────────────────
router.get('/', (req: Request<GroupParams>, res) => {
  const db = getDb();
  if (!assertMember(db, req.params.id, req.userPhone!)) {
    res.status(403).json({ error: 'Not a member of this group' });
    return;
  }
  const rows = asRows<PaymentRow>(db
    .prepare('SELECT * FROM payments WHERE group_id = ? ORDER BY created_at DESC')
    .all(req.params.id));
  res.json({ payments: rows.map(buildPayment) });
});

// ── POST /groups/:id/payments ─────────────────────────────────────────────────
router.post('/', validate(paymentSchema), (req: Request<GroupParams>, res) => {
  const body = req.body as z.infer<typeof paymentSchema>;
  const db = getDb();

  if (!assertMember(db, req.params.id, req.userPhone!)) {
    res.status(403).json({ error: 'Not a member of this group' });
    return;
  }
  if (body.fromPhone === body.toPhone) {
    res.status(400).json({ error: 'Cannot record a payment to yourself' });
    return;
  }
  if (!assertMember(db, req.params.id, body.fromPhone)) {
    res.status(400).json({ error: 'Payer is not an active group member' });
    return;
  }
  if (!assertMember(db, req.params.id, body.toPhone)) {
    res.status(400).json({ error: 'Payee is not an active group member' });
    return;
  }

  const amountPaise = Math.round(body.amountRupees * 100);
  const id = newId();
  const now = Date.now();

  db.prepare(`
    INSERT INTO payments (id, group_id, from_phone, to_phone, amount_paise, notes, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.params.id, body.fromPhone, body.toPhone, amountPaise,
         body.notes ?? null, req.userId!, now);

  const row = asRow<PaymentRow>(db.prepare('SELECT * FROM payments WHERE id = ?').get(id));
  res.status(201).json({ payment: buildPayment(row) });
});

// ── DELETE /groups/:id/payments/:pid ─────────────────────────────────────────
router.delete('/:pid', (req: Request<PaymentParams>, res) => {
  const db = getDb();
  const row = asRow<PaymentRow | undefined>(db
    .prepare('SELECT * FROM payments WHERE id = ? AND group_id = ?')
    .get(req.params.pid, req.params.id));

  if (!row) { res.status(404).json({ error: 'Payment not found' }); return; }
  if (row.created_by !== req.userId!) {
    res.status(403).json({ error: 'Only the person who recorded this payment can delete it' });
    return;
  }

  db.prepare('DELETE FROM payments WHERE id = ?').run(row.id);
  res.json({ success: true });
});

export default router;
