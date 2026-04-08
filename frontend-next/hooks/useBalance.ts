import { useMemo } from 'react';
import { computeNetBalances, computeSettlements } from '@/utils/balance';
import type { Expense, Payment, Group } from '@/types';

export function useBalance(group: Group, expenses: Expense[], payments: Payment[] = []) {
  return useMemo(() => {
    const phones = group.members.filter((m) => m.status === 'active').map((m) => m.phone);
    const nameMap = Object.fromEntries(group.members.map((m) => [m.phone, m.name]));
    const netBalances = computeNetBalances(expenses, payments, phones, nameMap);
    const settlements = computeSettlements(netBalances);
    const totalSpendPaise = expenses.filter((e) => !e.deletedAt).reduce((s, e) => s + e.amountPaise, 0);
    return { netBalances, settlements, totalSpendPaise };
  }, [group.members, expenses, payments]);
}

export function useMyBalance(group: Group, expenses: Expense[], myPhone: string, payments: Payment[] = []): number {
  const { netBalances } = useBalance(group, expenses, payments);
  return netBalances.find((b) => b.phone === myPhone)?.netPaise ?? 0;
}
