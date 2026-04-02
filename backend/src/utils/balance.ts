import type { Expense, NetBalance, Settlement } from '../types/index.js';

export type SplitType = 'equal' | 'exact' | 'percentage' | 'shares';

export interface CustomSplit {
  phone: string;
  value: number; // meaning depends on splitType
}

/**
 * Equal split — Largest Remainder Method.
 * Deterministic: participants sorted alphabetically, first `remainder` get +1 paise.
 */
export function splitEqually(
  amountPaise: number,
  phones: string[]
): Record<string, number> {
  const n = phones.length;
  if (n === 0) return {};
  const base = Math.floor(amountPaise / n);
  const remainder = amountPaise - base * n;
  const sorted = [...phones].sort();
  return Object.fromEntries(sorted.map((p, i) => [p, base + (i < remainder ? 1 : 0)]));
}

/**
 * Exact split — each split.value is an exact rupee amount.
 * Converts to paise and validates sum matches amountPaise.
 */
export function splitByExact(
  amountPaise: number,
  splits: CustomSplit[]
): Record<string, number> | null {
  const map: Record<string, number> = {};
  let total = 0;
  for (const s of splits) {
    const paise = Math.round(s.value * 100);
    map[s.phone] = paise;
    total += paise;
  }
  // Allow 1 paise tolerance for floating point
  if (Math.abs(total - amountPaise) > 1) return null;
  // Adjust first entry for any 1-paise rounding gap
  if (total !== amountPaise && splits.length > 0) {
    map[splits[0].phone] += amountPaise - total;
  }
  return map;
}

/**
 * Percentage split — each split.value is a percentage (0–100).
 * Sum of percentages must be ~100 (±0.01 tolerance for float).
 */
export function splitByPercentage(
  amountPaise: number,
  splits: CustomSplit[]
): Record<string, number> | null {
  const total = splits.reduce((s, c) => s + c.value, 0);
  if (Math.abs(total - 100) > 0.01) return null;

  // Sort by phone for determinism, then apply LRM for remainder paise
  const sorted = [...splits].sort((a, b) => a.phone.localeCompare(b.phone));
  const rawPaise = sorted.map((s) => (amountPaise * s.value) / 100);
  const floors = rawPaise.map(Math.floor);
  const remainder = amountPaise - floors.reduce((a, b) => a + b, 0);

  // Assign remainder paise to entries with largest fractional part
  const order = rawPaise
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);

  const final = [...floors];
  for (let k = 0; k < remainder; k++) final[order[k].i]++;

  return Object.fromEntries(sorted.map((s, i) => [s.phone, final[i]]));
}

/**
 * Shares split — each split.value is a share count (positive integer).
 * E.g., [1, 1, 2] → 25%, 25%, 50%.
 */
export function splitByShares(
  amountPaise: number,
  splits: CustomSplit[]
): Record<string, number> | null {
  const totalShares = splits.reduce((s, c) => s + c.value, 0);
  if (totalShares <= 0) return null;

  const sorted = [...splits].sort((a, b) => a.phone.localeCompare(b.phone));
  const rawPaise = sorted.map((s) => (amountPaise * s.value) / totalShares);
  const floors = rawPaise.map(Math.floor);
  const remainder = amountPaise - floors.reduce((a, b) => a + b, 0);

  const order = rawPaise
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);

  const final = [...floors];
  for (let k = 0; k < remainder; k++) final[order[k].i]++;

  return Object.fromEntries(sorted.map((s, i) => [s.phone, final[i]]));
}

/** Build a split map from any split type. Returns null if validation fails. */
export function buildSplitMap(
  splitType: SplitType,
  amountPaise: number,
  phones: string[],
  customSplits?: CustomSplit[]
): Record<string, number> | null {
  if (splitType === 'equal') return splitEqually(amountPaise, phones);
  if (!customSplits || customSplits.length === 0) return null;
  if (splitType === 'exact') return splitByExact(amountPaise, customSplits);
  if (splitType === 'percentage') return splitByPercentage(amountPaise, customSplits);
  if (splitType === 'shares') return splitByShares(amountPaise, customSplits);
  return null;
}

/** Net balance per participant across all non-deleted expenses. */
export function computeNetBalances(
  expenses: Expense[],
  memberPhones: string[],
  nameMap: Record<string, string>
): NetBalance[] {
  const net: Record<string, number> = Object.fromEntries(memberPhones.map((p) => [p, 0]));
  for (const e of expenses) {
    if (e.deletedAt !== null) continue;
    net[e.paidByPhone] = (net[e.paidByPhone] ?? 0) + e.amountPaise;
    for (const s of e.shares) net[s.phone] = (net[s.phone] ?? 0) - s.amountPaise;
  }
  return Object.entries(net).map(([phone, netPaise]) => ({
    phone, name: nameMap[phone] ?? phone, netPaise,
  }));
}

/** Greedy O(n log n) debt simplification → minimal transfers. */
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

export function validateShares(amountPaise: number, shares: Record<string, number>): boolean {
  return Object.values(shares).reduce((a, b) => a + b, 0) === amountPaise;
}
