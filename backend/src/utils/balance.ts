import type { Expense, NetBalance, Settlement } from '../types/index.js';

/**
 * Equal split using the Largest Remainder Method.
 * All arithmetic in integer paise — no floating point.
 * Deterministic: participants sorted alphabetically, first `remainder`
 * members receive 1 extra paise.
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

  return Object.fromEntries(
    sorted.map((phone, i) => [phone, base + (i < remainder ? 1 : 0)])
  );
}

/** Net balance per participant across all expenses. */
export function computeNetBalances(
  expenses: Expense[],
  memberPhones: string[],
  nameMap: Record<string, string>
): NetBalance[] {
  const net: Record<string, number> = Object.fromEntries(
    memberPhones.map((p) => [p, 0])
  );

  for (const e of expenses) {
    if (e.deletedAt !== null) continue;
    net[e.paidByPhone] = (net[e.paidByPhone] ?? 0) + e.amountPaise;
    for (const s of e.shares) {
      net[s.phone] = (net[s.phone] ?? 0) - s.amountPaise;
    }
  }

  return Object.entries(net).map(([phone, netPaise]) => ({
    phone,
    name: nameMap[phone] ?? phone,
    netPaise,
  }));
}

/**
 * Greedy O(n log n) debt simplification.
 * Produces minimal transfers to settle all balances.
 */
export function computeSettlements(balances: NetBalance[]): Settlement[] {
  const creditors = balances
    .filter((b) => b.netPaise > 0)
    .map((b) => ({ ...b, amount: b.netPaise }))
    .sort((a, b) => b.amount - a.amount);

  const debtors = balances
    .filter((b) => b.netPaise < 0)
    .map((b) => ({ ...b, amount: -b.netPaise }))
    .sort((a, b) => b.amount - a.amount);

  const settlements: Settlement[] = [];
  let ci = 0, di = 0;

  while (ci < creditors.length && di < debtors.length) {
    const transfer = Math.min(creditors[ci].amount, debtors[di].amount);
    if (transfer > 0) {
      settlements.push({
        fromPhone: debtors[di].phone,
        fromName: debtors[di].name,
        toPhone: creditors[ci].phone,
        toName: creditors[ci].name,
        amountPaise: transfer,
      });
    }
    creditors[ci].amount -= transfer;
    debtors[di].amount -= transfer;
    if (creditors[ci].amount === 0) ci++;
    if (debtors[di].amount === 0) di++;
  }

  return settlements;
}

export function validateShares(
  amountPaise: number,
  shares: Record<string, number>
): boolean {
  return Object.values(shares).reduce((a, b) => a + b, 0) === amountPaise;
}
