import { Router } from 'express';
import { getDb, asRows } from '../database/index.js';
import { requireAuth } from '../middleware/auth.js';
import type { ExpenseRow, ExpenseShareRow } from '../types/index.js';

const router = Router();
router.use(requireAuth);

function formatMonth(epochMs: number): string {
  const d = new Date(epochMs);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ── GET /analytics ────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const db = getDb();
  const myPhone = req.userPhone!;

  // All expenses across groups the user belongs to
  const expenses = asRows<ExpenseRow>(db.prepare(`
    SELECT e.* FROM expenses e
    JOIN group_members gm ON gm.group_id = e.group_id
    WHERE gm.phone = ? AND gm.status = 'active' AND e.deleted_at IS NULL
    ORDER BY e.created_at DESC
  `).all(myPhone));

  if (expenses.length === 0) {
    res.json({ totalPaidPaise: 0, totalSharePaise: 0, monthly: [], byCategory: [], byGroup: [] });
    return;
  }

  const expenseIds = expenses.map((e) => e.id);

  // Fetch all my shares in a single query
  const myShares: Record<string, number> = {};
  const placeholders = expenseIds.map(() => '?').join(',');
  const shareRows = asRows<ExpenseShareRow>(db.prepare(
    `SELECT * FROM expense_shares WHERE expense_id IN (${placeholders}) AND phone = ?`
  ).all(...expenseIds, myPhone));
  for (const r of shareRows) myShares[r.expense_id] = r.amount_paise;

  // Batch-fetch all unique group names in one query — avoids N+1
  const groupIds = [...new Set(expenses.map((e) => e.group_id))];
  const groupPlaceholders = groupIds.map(() => '?').join(',');
  const groupNameMap: Record<string, string> = {};
  asRows<{ id: string; name: string }>(db.prepare(
    `SELECT id, name FROM groups WHERE id IN (${groupPlaceholders})`
  ).all(...groupIds)).forEach((g) => { groupNameMap[g.id] = g.name; });

  let totalPaidPaise = 0;
  let totalSharePaise = 0;
  const monthlyMap: Record<string, number> = {};
  const categoryMap: Record<string, number> = {};
  const groupSpendMap: Record<string, { name: string; paise: number }> = {};

  for (const e of expenses) {
    if (e.paid_by_phone === myPhone) totalPaidPaise += e.amount_paise;
    const share = myShares[e.id] ?? 0;
    totalSharePaise += share;

    if (share > 0) {
      const month = formatMonth(e.created_at);
      monthlyMap[month] = (monthlyMap[month] ?? 0) + share;
      categoryMap[e.category] = (categoryMap[e.category] ?? 0) + share;
    }

    const groupName = groupNameMap[e.group_id] ?? e.group_id;
    if (!groupSpendMap[e.group_id]) groupSpendMap[e.group_id] = { name: groupName, paise: 0 };
    groupSpendMap[e.group_id].paise += e.amount_paise;
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
});

export default router;
