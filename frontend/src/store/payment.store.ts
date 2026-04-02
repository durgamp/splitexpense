import { create } from 'zustand';
import type { Payment } from '@/types';

interface PaymentState {
  byGroup: Record<string, Payment[]>;
  setGroupPayments: (groupId: string, payments: Payment[]) => void;
  addPayment: (payment: Payment) => void;
  removePayment: (groupId: string, paymentId: string) => void;
  getGroupPayments: (groupId: string) => Payment[];
}

export const usePaymentStore = create<PaymentState>((set, get) => ({
  byGroup: {},

  setGroupPayments: (groupId, payments) =>
    set((s) => ({ byGroup: { ...s.byGroup, [groupId]: payments } })),

  addPayment: (payment) =>
    set((s) => ({
      byGroup: {
        ...s.byGroup,
        [payment.groupId]: [payment, ...(s.byGroup[payment.groupId] ?? [])],
      },
    })),

  removePayment: (groupId, paymentId) =>
    set((s) => ({
      byGroup: {
        ...s.byGroup,
        [groupId]: (s.byGroup[groupId] ?? []).filter((p) => p.id !== paymentId),
      },
    })),

  getGroupPayments: (groupId) => get().byGroup[groupId] ?? [],
}));
