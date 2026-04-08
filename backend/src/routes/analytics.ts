import { Router } from 'express';
import { getRequest, toNum, sql } from '../database/index.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import type { ExpenseRow, ExpenseShareRow } from '../types/index.js';

const router = Router();
router.use(requireAuth);

function formatMonth(epochMs: number): string {
  const d = new Date(epochMs);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ── GET /analytics ────────────────────────────────────────────────────────────
router.get('/', asyncHandler(async (req, res) => {
  const myPhone = req.userPhone!;

  // All expenses across groups the user belongs to
  const expenses = (await (await getRequest())
    .input('phone', sql.NVarChar(20), myPhone)
    .query(`
      SELECT e.* FROM expenses e
      JOIN group_members gm ON gm.group_id = e.group_id
      WHERE gm.phone = @phone AND gm.status = 'active' AND e.deleted_at IS NULL
      ORDER BY e.created_at DESC
    `)).recordset as ExpenseRow[];

  if (expenses.length === 0) {
    res.json({ totalPaidPaise: 0, totalSharePaise: 0, monthly: [], byCategory: [], byGroup: [] });
    return;
  }

  const expenseIds = expenses.map((e) => e.id);

  // Fetch all my shares — build named params dynamically (safe: IDs are internal UUIDs)
  const shareReq = await getRequest();
  shareReq.input('myPhone', sql.NVarChar(20), myPhone);
  expenseIds.forEach((id, i) => shareReq.input(`eid${i}`, sql.NVarChar(36), id));
  const inList = expenseIds.map((_, i) => `@eid${i}`).join(',');
  const shareRows = (await shareReq.query(
    `SELECT * FROM expense_shares WHERE expense_id IN (${inList}) AND phone = @myPhone`
  )).recordset as ExpenseShareRow[];

  const myShares: Record<string, number> = {};
  for (const r of shareRows) myShares[r.expense_id] = toNum(r.amount_paise);

  // Batch-fetch all unique group names
  const groupIds = [...new Set(expenses.map((e) => e.group_id))];
  const groupReq = await getRequest();
  groupIds.forEach((id, i) => groupReq.input(`gid${i}`, sql.NVarChar(36), id));
  const groupInList = groupIds.map((_, i) => `@gid${i}`).join(',');
  const groupNameMap: Record<string, string> = {};
  (await groupReq.query(`SELECT id, name FROM groups WHERE id IN (${groupInList})`))
    .recordset.forEach((g: { id: string; name: string }) => { groupNameMap[g.id] = g.name; });

  let totalPaidPaise = 0;
  let totalSharePaise = 0;
  const monthlyMap: Record<string, number> = {};
  const categoryMap: Record<string, number> = {};
  const groupSpendMap: Record<string, { name: string; paise: number }> = {};

  for (const e of expenses) {
    const amountPaise = toNum(e.amount_paise);
    const createdAt   = toNum(e.created_at);

    if (e.paid_by_phone === myPhone) totalPaidPaise += amountPaise;
    const share = myShares[e.id] ?? 0;
    totalSharePaise += share;

    if (share > 0) {
      const month = formatMonth(createdAt);
      monthlyMap[month] = (monthlyMap[month] ?? 0) + share;
      categoryMap[e.category] = (categoryMap[e.category] ?? 0) + share;
    }

    const groupName = groupNameMap[e.group_id] ?? e.group_id;
    if (!groupSpendMap[e.group_id]) groupSpendMap[e.group_id] = { name: groupName, paise: 0 };
    groupSpendMap[e.group_id].paise += amountPaise;
  }

  const monthly = Object.entries(monthlyMap)
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 12)
    .map(([month, paise]) => ({ month, paise }));

  const byCategory = Object.entries(categoryMap)
    .sort(([, a], [, b]) => b - a)
    .map(([category, paise]) => ({ category, paise }));

  const byGroup = Object.entries(groupSpendMap)
    .sort(([, a], [, b]) => b.paise - a.paise)
    .map(([groupId, v]) => ({ groupId, name: v.name, paise: v.paise }));

  res.json({ totalPaidPaise, totalSharePaise, monthly, byCategory, byGroup });
}));

export default router;
