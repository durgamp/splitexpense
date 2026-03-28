import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { useGroupStore } from '@/store/group.store';
import { useExpenseStore } from '@/store/expense.store';
import { useAuthStore } from '@/store/auth.store';
import { expensesApi } from '@/services/api';
import { fmtShort, rupeesToPaise } from '@/utils/format';
import { splitEqually } from '@/utils/balance';
import type { ExpenseCategory } from '@/types';

const CATS: { key: ExpenseCategory; emoji: string; label: string }[] = [
  { key: 'food', emoji: '🍽️', label: 'Food' },
  { key: 'transport', emoji: '🚗', label: 'Transport' },
  { key: 'accommodation', emoji: '🏠', label: 'Stay' },
  { key: 'entertainment', emoji: '🎬', label: 'Fun' },
  { key: 'utilities', emoji: '💡', label: 'Bills' },
  { key: 'shopping', emoji: '🛍️', label: 'Shopping' },
  { key: 'other', emoji: '📌', label: 'Other' },
];

export default function AddExpense() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const group = useGroupStore((s) => s.getById(id ?? ''));
  const { upsertExpense } = useExpenseStore();

  const active = group?.members.filter((m) => m.status === 'active') ?? [];
  const allPhones = active.map((m) => m.phone);

  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState('');
  const [paidBy, setPaidBy] = useState(user?.phone ?? '');
  const [participants, setParticipants] = useState<string[]>(allPhones);
  const [category, setCategory] = useState<ExpenseCategory>('other');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const amtNum = parseFloat(amount);
  const amtPaise = !isNaN(amtNum) && amtNum > 0 ? rupeesToPaise(amtNum) : 0;
  const splitMap = amtPaise > 0 && participants.length > 0
    ? splitEqually(amtPaise, participants)
    : {};

  const allSelected = participants.length === allPhones.length;

  function toggleParticipant(phone: string) {
    setParticipants((prev) =>
      prev.includes(phone) ? prev.filter((p) => p !== phone) : [...prev, phone]
    );
    setErrors((v) => ({ ...v, participants: '' }));
  }

  function toggleAll() {
    setParticipants(allSelected ? [] : [...allPhones]);
    setErrors((v) => ({ ...v, participants: '' }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!desc.trim()) errs.desc = 'Add a description';
    if (isNaN(amtNum) || amtNum <= 0) errs.amount = 'Enter a valid amount';
    if (amtNum > 10_000_000) errs.amount = 'Amount too large';
    if (participants.length === 0) errs.participants = 'Select at least one participant';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setLoading(true);
    try {
      const { data } = await expensesApi.create(id!, {
        description: desc.trim(), amountRupees: amtNum,
        paidByPhone: paidBy, participantPhones: participants, category,
      });
      upsertExpense(data.expense);
      navigate(`/group/${id}`);
    } catch { setErrors({ submit: 'Failed to add expense' }); }
    finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-gray-400">✕</button>
        <h1 className="font-bold text-gray-900 flex-1">Add Expense</h1>
      </div>

      <form onSubmit={handleSubmit} className="p-4 flex flex-col gap-5 pb-20">
        <Input label="Amount (₹)" value={amount}
          onChange={(e) => { setAmount(e.target.value.replace(/[^0-9.]/g, '')); setErrors((v) => ({ ...v, amount: '' })); }}
          placeholder="0.00" prefix="₹" inputMode="decimal" error={errors.amount} autoFocus />

        <Input label="What's it for?" value={desc}
          onChange={(e) => { setDesc(e.target.value); setErrors((v) => ({ ...v, desc: '' })); }}
          placeholder="Dinner, Cab, Hotel…" error={errors.desc} />

        {/* Category */}
        <div>
          <p className="text-sm font-medium text-gray-500 mb-2">Category</p>
          <div className="flex gap-2 flex-wrap">
            {CATS.map((c) => (
              <button key={c.key} type="button" onClick={() => setCategory(c.key)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-xl border-2 text-sm font-medium transition-colors ${category === c.key ? 'border-primary bg-primary-light text-primary' : 'border-gray-200 bg-white text-gray-600'}`}>
                {c.emoji} {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* Paid by */}
        <div>
          <p className="text-sm font-medium text-gray-500 mb-2">Paid by</p>
          <div className="flex gap-2 flex-wrap">
            {active.map((m) => (
              <button key={m.phone} type="button" onClick={() => setPaidBy(m.phone)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full border-2 text-sm font-medium transition-colors ${paidBy === m.phone ? 'border-primary bg-primary-light text-primary' : 'border-gray-200 bg-white text-gray-600'}`}>
                <Avatar name={m.name} size={22} />
                {m.phone === user?.phone ? 'You' : m.name}
              </button>
            ))}
          </div>
        </div>

        {/* Split among */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-gray-500">
              Split among{amtPaise > 0 && participants.length > 0
                ? ` · ₹${(amtNum / participants.length).toFixed(2)} each`
                : ''}
            </p>
            <button type="button" onClick={toggleAll}
              className="text-xs font-semibold text-primary hover:text-primary-dark transition-colors px-2 py-0.5 rounded-lg bg-primary-light">
              {allSelected ? 'Select none' : 'Select all'}
            </button>
          </div>
          {errors.participants && <p className="text-red-500 text-xs mb-2">{errors.participants}</p>}
          <div className="bg-white rounded-2xl shadow-sm divide-y divide-gray-100">
            {active.map((m) => {
              const sel = participants.includes(m.phone);
              const share = splitMap[m.phone];
              return (
                <button key={m.phone} type="button" onClick={() => toggleParticipant(m.phone)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
                  <Avatar name={m.name} size={36} />
                  <div className="flex-1 text-left">
                    <p className="text-gray-900 font-medium">
                      {m.phone === user?.phone ? 'You' : m.name}
                    </p>
                    {sel && share !== undefined ? (
                      <p className="text-xs text-primary">{fmtShort(share)}</p>
                    ) : !sel ? (
                      <p className="text-xs text-gray-400">Not included</p>
                    ) : null}
                  </div>
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${sel ? 'bg-primary border-primary' : 'border-gray-300'}`}>
                    {sel && <span className="text-white text-xs font-bold">✓</span>}
                  </div>
                </button>
              );
            })}
          </div>
          {amtPaise > 0 && participants.length > 0 && (
            <p className="text-xs text-gray-400 mt-2 text-right">
              {fmtShort(amtPaise)} ÷ {participants.length} member{participants.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>

        {errors.submit && <p className="text-red-500 text-sm">{errors.submit}</p>}
        <Button type="submit" fullWidth size="lg" loading={loading}>Add Expense</Button>
      </form>
    </div>
  );
}
