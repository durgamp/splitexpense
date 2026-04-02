import type { Expense, Payment, NetBalance, Settlement, SplitType, CustomSplit } from '@/types';

// ── Split calculators ─────────────────────────────────────────────────────────

export function splitEqually(amountPaise: number, phones: string[]): Record<string, number> {
  const n = phones.length;
  if (n === 0) return {};
  const base = Math.floor(amountPaise / n);
  const remainder = amountPaise - base * n;
  const sorted = [...phones].sort();
  return Object.fromEntries(sorted.map((p, i) => [p, base + (i < remainder ? 1 : 0)]));
}

export function splitByExact(amountPaise: number, splits: CustomSplit[]): Record<string, number> | null {
  const map: Record<string, number> = {};
  let total = 0;
  for (const s of splits) {
    const paise = Math.round(s.value * 100);
    map[s.phone] = paise;
    total += paise;
  }
  if (Math.abs(total - amountPaise) > 1) return null;
  if (total !== amountPaise && splits.length > 0) map[splits[0].phone] += amountPaise - total;
  return map;
}

export function splitByPercentage(amountPaise: number, splits: CustomSplit[]): Record<string, number> | null {
  const total = splits.reduce((s, c) => s + c.value, 0);
  if (Math.abs(total - 100) > 0.01) return null;
  const sorted = [...splits].sort((a, b) => a.phone.localeCompare(b.phone));
  const raw = sorted.map((s) => (amountPaise * s.value) / 100);
  const floors = raw.map(Math.floor);
  const rem = amountPaise - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac);
  const final = [...floors];
  for (let k = 0; k < rem; k++) final[order[k].i]++;
  return Object.fromEntries(sorted.map((s, i) => [s.phone, final[i]]));
}

export function splitByShares(amountPaise: number, splits: CustomSplit[]): Record<string, number> | null {
  const totalShares = splits.reduce((s, c) => s + c.value, 0);
  if (totalShares <= 0) return null;
  const sorted = [...splits].sort((a, b) => a.phone.localeCompare(b.phone));
  const raw = sorted.map((s) => (amountPaise * s.value) / totalShares);
  const floors = raw.map(Math.floor);
  const rem = amountPaise - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac);
  const final = [...floors];
  for (let k = 0; k < rem; k++) final[order[k].i]++;
  return Object.fromEntries(sorted.map((s, i) => [s.phone, final[i]]));
}

export function buildSplitMap(
  splitType: SplitType,
  amountPaise: number,
  phones: string[],
  customSplits?: CustomSplit[]
): Record<string, number> | null {
  if (splitType === 'equal') return splitEqually(amountPaise, phones);
  if (!customSplits?.length) return null;
  if (splitType === 'exact') return splitByExact(amountPaise, customSplits);
  if (splitType === 'percentage') return splitByPercentage(amountPaise, customSplits);
  if (splitType === 'shares') return splitByShares(amountPaise, customSplits);
  return null;
}

// ── Balance engine ────────────────────────────────────────────────────────────

/**
 * Net balance per member.
 * Payments count as: payer's balance += amountPaise, payee's balance -= amountPaise
 * (mirror of expense logic: payer is +, share holder is -).
 */
export function computeNetBalances(
  expenses: Expense[],
  payments: Payment[],
  memberPhones: string[],
  nameMap: Record<string, string>
): NetBalance[] {
  const net: Record<string, number> = Object.fromEntries(memberPhones.map((p) => [p, 0]));

  for (const e of expenses) {
    if (e.deletedAt !== null) continue;
    net[e.paidByPhone] = (net[e.paidByPhone] ?? 0) + e.amountPaise;
    for (const s of e.shares) net[s.phone] = (net[s.phone] ?? 0) - s.amountPaise;
  }

  // Payments settle debts: the person who paid (fromPhone) gains credit,
  // the recipient (toPhone) loses the credit they were owed.
  for (const p of payments) {
    net[p.fromPhone] = (net[p.fromPhone] ?? 0) + p.amountPaise;
    net[p.toPhone] = (net[p.toPhone] ?? 0) - p.amountPaise;
  }

  return Object.entries(net).map(([phone, netPaise]) => ({
    phone, name: nameMap[phone] ?? phone, netPaise,
  }));
}

export function computeSettlements(balances: NetBalance[]): Settlement[] {
  const creditors = balances.filter((b) => b.netPaise > 0)
    .map((b) => ({ ...b, amount: b.netPaise })).sort((a, b) => b.amount - a.amount);
  const debtors = balances.filter((b) => b.netPaise < 0)
    .map((b) => ({ ...b, amount: -b.netPaise })).sort((a, b) => b.amount - a.amount);

  const result: Settlement[] = [];
  let ci = 0, di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const t = Math.min(creditors[ci].amount, debtors[di].amount);
    if (t > 0) result.push({
      fromPhone: debtors[di].phone, fromName: debtors[di].name,
      toPhone: creditors[ci].phone, toName: creditors[ci].name, amountPaise: t,
    });
    creditors[ci].amount -= t; debtors[di].amount -= t;
    if (creditors[ci].amount === 0) ci++;
    if (debtors[di].amount === 0) di++;
  }
  return result;
}
