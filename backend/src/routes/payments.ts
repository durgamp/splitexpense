import { Router, type Request } from 'express';
import { z } from 'zod';
import { getRequest, toNum, sql } from '../database/index.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
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
    amountPaise: toNum(row.amount_paise),
    notes: row.notes ?? null,
    createdBy: row.created_by,
    createdAt: toNum(row.created_at),
  };
}

async function assertMember(groupId: string, phone: string): Promise<boolean> {
  const result = await (await getRequest())
    .input('groupId', sql.NVarChar(36), groupId)
    .input('phone',   sql.NVarChar(20), phone)
    .query("SELECT 1 AS one FROM group_members WHERE group_id = @groupId AND phone = @phone AND status = 'active'");
  return result.recordset.length > 0;
}

// ── GET /groups/:id/payments ──────────────────────────────────────────────────
router.get('/', asyncHandler(async (req: Request<GroupParams>, res) => {
  if (!(await assertMember(req.params.id, req.userPhone!))) {
    res.status(403).json({ error: 'Not a member of this group' });
    return;
  }

  const rows = (await (await getRequest())
    .input('groupId', sql.NVarChar(36), req.params.id)
    .query('SELECT * FROM payments WHERE group_id = @groupId ORDER BY created_at DESC'))
    .recordset as PaymentRow[];

  res.json({ payments: rows.map(buildPayment) });
}));

// ── POST /groups/:id/payments ─────────────────────────────────────────────────
router.post('/', validate(paymentSchema), asyncHandler(async (req: Request<GroupParams>, res) => {
  const body = req.body as z.infer<typeof paymentSchema>;

  if (!(await assertMember(req.params.id, req.userPhone!))) {
    res.status(403).json({ error: 'Not a member of this group' });
    return;
  }
  if (body.fromPhone === body.toPhone) {
    res.status(400).json({ error: 'Cannot record a payment to yourself' });
    return;
  }
  if (!(await assertMember(req.params.id, body.fromPhone))) {
    res.status(400).json({ error: 'Payer is not an active group member' });
    return;
  }
  if (!(await assertMember(req.params.id, body.toPhone))) {
    res.status(400).json({ error: 'Payee is not an active group member' });
    return;
  }

  const amountPaise = Math.round(body.amountRupees * 100);
  const id = newId();
  const now = Date.now();

  await (await getRequest())
    .input('id',          sql.NVarChar(36),  id)
    .input('groupId',     sql.NVarChar(36),  req.params.id)
    .input('fromPhone',   sql.NVarChar(20),  body.fromPhone)
    .input('toPhone',     sql.NVarChar(20),  body.toPhone)
    .input('amountPaise', sql.BigInt,        amountPaise)
    .input('notes',       sql.NVarChar(200), body.notes ?? null)
    .input('createdBy',   sql.NVarChar(36),  req.userId!)
    .input('now',         sql.BigInt,        now)
    .query(`
      INSERT INTO payments (id, group_id, from_phone, to_phone, amount_paise, notes, created_by, created_at)
      VALUES (@id, @groupId, @fromPhone, @toPhone, @amountPaise, @notes, @createdBy, @now)
    `);

  const row = (await (await getRequest())
    .input('id', sql.NVarChar(36), id)
    .query('SELECT * FROM payments WHERE id = @id')).recordset[0] as PaymentRow;

  res.status(201).json({ payment: buildPayment(row) });
}));

// ── DELETE /groups/:id/payments/:pid ─────────────────────────────────────────
router.delete('/:pid', asyncHandler(async (req: Request<PaymentParams>, res) => {
  const row = (await (await getRequest())
    .input('pid',     sql.NVarChar(36), req.params.pid)
    .input('groupId', sql.NVarChar(36), req.params.id)
    .query('SELECT * FROM payments WHERE id = @pid AND group_id = @groupId'))
    .recordset[0] as PaymentRow | undefined;

  if (!row) { res.status(404).json({ error: 'Payment not found' }); return; }
  if (row.created_by !== req.userId!) {
    res.status(403).json({ error: 'Only the person who recorded this payment can delete it' });
    return;
  }

  await (await getRequest())
    .input('id', sql.NVarChar(36), row.id)
    .query('DELETE FROM payments WHERE id = @id');

  res.json({ success: true });
}));

export default router;
