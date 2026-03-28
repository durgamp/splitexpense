import { create } from 'zustand';
import type { Expense } from '@/types';

interface ExpenseState {
  byGroup: Record<string, Expense[]>;
  loading: boolean;

  setGroupExpenses: (groupId: string, expenses: Expense[]) => void;
  upsertExpense: (expense: Expense) => void;
  removeExpense: (groupId: string, expenseId: string) => void;
  getGroupExpenses: (groupId: string) => Expense[];
  setLoading: (v: boolean) => void;
}

export const useExpenseStore = create<ExpenseState>((set, get) => ({
  byGroup: {},
  loading: false,

  setGroupExpenses: (groupId, expenses) =>
    set((s) => ({ byGroup: { ...s.byGroup, [groupId]: expenses } })),

  upsertExpense: (expense) =>
    set((s) => {
      const list = s.byGroup[expense.groupId] ?? [];
      const idx = list.findIndex((e) => e.id === expense.id);
      const updated = idx >= 0
        ? list.map((e, i) => (i === idx ? expense : e))
        : [expense, ...list];
      return { byGroup: { ...s.byGroup, [expense.groupId]: updated } };
    }),

  removeExpense: (groupId, expenseId) =>
    set((s) => ({
      byGroup: {
        ...s.byGroup,
        [groupId]: (s.byGroup[groupId] ?? []).filter((e) => e.id !== expenseId),
      },
    })),

  getGroupExpenses: (groupId) => get().byGroup[groupId] ?? [],

  setLoading: (loading) => set({ loading }),
}));
