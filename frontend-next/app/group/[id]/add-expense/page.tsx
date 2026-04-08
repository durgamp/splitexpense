'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { AuthGuard } from '@/components/AuthGuard';
import { useGroupStore } from '@/store/group.store';
import { useExpenseStore } from '@/store/expense.store';
import { useAuthStore } from '@/store/auth.store';
import { expensesApi } from '@/services/api';
import { fmtShort, rupeesToPaise } from '@/utils/format';
import { buildSplitMap } from '@/utils/balance';
import type { ExpenseCategory, SplitType, CustomSplit } from '@/types';

const CATS: { key: ExpenseCategory; emoji: string; label: string }[] = [
  { key: 'food', emoji: '🍽️', label: 'Food' },
  { key: 'transport', emoji: '🚗', label: 'Transport' },
  { key: 'accommodation', emoji: '🏠', label: 'Stay' },
  { key: 'entertainment', emoji: '🎬', label: 'Fun' },
  { key: 'utilities', emoji: '💡', label: 'Bills' },
  { key: 'shopping', emoji: '🛍️', label: 'Shopping' },
  { key: 'other', emoji: '📌', label: 'Other' },
];

const SPLIT_MODES: { key: SplitType; label: string; desc: string }[] = [
  { key: 'equal',      label: 'Equal',   desc: 'Split evenly among all' },
  { key: 'exact',      label: 'Exact ₹', desc: 'Set exact amounts' },
  { key: 'percentage', label: '%',        desc: 'Set percentages (must = 100%)' },
  { key: 'shares',     label: 'Shares',  desc: 'Split by ratio' },
];

function AddExpenseContent() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const group = useGroupStore((s) => s.getById(id ?? ''));
  const { upsertExpense } = useExpenseStore();

  const allMembers = group?.members.filter((m) => m.status !== 'removed') ?? [];
  const activeMembers = group?.members.filter((m) => m.status === 'active') ?? [];
  const allPhones = allMembers.map((m) => m.phone);

  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [paidBy, setPaidBy] = useState(user?.phone ?? '');
  const [participants, setParticipants] = useState<string[]>([]);
  const [category, setCategory] = useState<ExpenseCategory>('other');
  const [splitType, setSplitType] = useState<SplitType>('equal');
  const [customSplits, setCustomSplits] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (allPhones.length > 0 && participants.length === 0) setParticipants(allPhones);
  }, [allPhones.join(',')]);

  useEffect(() => {
    if (splitType !== 'equal') {
      const defaults: Record<string, string> = {};
      participants.forEach((p) => {
        defaults[p] = splitType === 'shares' ? (customSplits[p] ?? '1') : (customSplits[p] ?? '');
      });
      setCustomSplits(defaults);
    }
  }, [splitType, participants.join(',')]);

  const amtNum = parseFloat(amount);
  const amtPaise = !isNaN(amtNum) && amtNum > 0 ? rupeesToPaise(amtNum) : 0;

  const splits: CustomSplit[] = participants.map((p) => ({
    phone: p, value: parseFloat(customSplits[p] ?? '0') || 0,
  }));
  const splitMap = amtPaise > 0 && participants.length > 0
    ? buildSplitMap(splitType, amtPaise, participants, splits) ?? {}
    : {};

  function splitHint(): string | null {
    if (splitType === 'exact') {
      const sum = splits.reduce((s, c) => s + Math.round((c.value || 0) * 100), 0);
      if (amtPaise > 0 && Math.abs(sum - amtPaise) > 1)
        return `Total: ₹${(sum / 100).toFixed(2)} — must equal ₹${amtNum.toFixed(2)}`;
    }
    if (splitType === 'percentage') {
      const sum = splits.reduce((s, c) => s + (c.value || 0), 0);
      if (participants.length > 0 && Math.abs(sum - 100) > 0.01)
        return `Total: ${sum.toFixed(1)}% — must equal 100%`;
    }
    return null;
  }

  const allSelected = participants.length === allPhones.length && allPhones.length > 0;

  function toggleParticipant(phone: string) {
    setParticipants((prev) => prev.includes(phone) ? prev.filter((p) => p !== phone) : [...prev, phone]);
    setErrors((v) => ({ ...v, participants: '' }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!desc.trim()) errs.desc = 'Add a description';
    if (isNaN(amtNum) || amtNum <= 0) errs.amount = 'Enter a valid amount';
    if (amtNum > 10_000_000) errs.amount = 'Amount too large';
    if (participants.length === 0) errs.participants = 'Select at least one participant';
    if (splitType !== 'equal' && !buildSplitMap(splitType, amtPaise, participants, splits)) {
      errs.split = splitType === 'exact'
        ? 'Amounts must sum to the total'
        : splitType === 'percentage'
        ? 'Percentages must sum to 100%'
        : 'Enter valid share values';
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setLoading(true);
    try {
      const { data } = await expensesApi.create(id!, {
        description: desc.trim(),
        amountRupees: amtNum,
        paidByPhone: paidBy,
        participantPhones: participants,
        category,
        splitType,
        splits: splitType !== 'equal' ? splits : undefined,
        notes: notes.trim() || undefined,
      });
      upsertExpense(data.expense);
      router.push(`/group/${id}`);
    } catch { setErrors({ submit: 'Failed to add expense' }); }
    finally { setLoading(false); }
  }

  const hint = splitHint();

  return (
    <div className="min-h-screen bg-gray-50 max-w-lg mx-auto">
      <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 z-10">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        <h1 className="font-bold text-gray-900 flex-1">Add Expense</h1>
        {group && <p className="text-sm text-gray-400">{group.name}</p>}
      </div>

      <form onSubmit={handleSubmit} className="p-4 flex flex-col gap-5 pb-24">
        {/* Amount */}
        <Input label="Amount (₹)" value={amount}
          onChange={(e) => { setAmount(e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1')); setErrors((v) => ({ ...v, amount: '' })); }}
          placeholder="0.00" prefix="₹" inputMode="decimal" error={errors.amount} autoFocus />

        {/* Description */}
        <Input label="What's it for?" value={desc}
          onChange={(e) => { setDesc(e.target.value); setErrors((v) => ({ ...v, desc: '' })); }}
          placeholder="Dinner, Cab, Hotel…" error={errors.desc} />

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">
            Notes <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="Any extra details…" maxLength={500} rows={2}
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-500" />
        </div>

        {/* Category */}
        <div>
          <p className="text-sm font-medium text-gray-600 mb-2">Category</p>
          <div className="flex gap-2 flex-wrap">
            {CATS.map((c) => (
              <button key={c.key} type="button" onClick={() => setCategory(c.key)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-xl border-2 text-sm font-medium transition-colors
                  ${category === c.key ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 bg-white text-gray-600'}`}>
                {c.emoji} {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* Paid by */}
        <div>
          <p className="text-sm font-medium text-gray-600 mb-2">Paid by</p>
          <div className="flex gap-2 flex-wrap">
            {activeMembers.map((m) => (
              <button key={m.phone} type="button" onClick={() => setPaidBy(m.phone)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full border-2 text-sm font-medium transition-colors
                  ${paidBy === m.phone ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 bg-white text-gray-600'}`}>
                <Avatar name={m.name} size={22} />
                {m.phone === user?.phone ? 'You' : m.name}
              </button>
            ))}
          </div>
        </div>

        {/* Split type */}
        <div>
          <p className="text-sm font-medium text-gray-600 mb-2">Split type</p>
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
            {SPLIT_MODES.map((m) => (
              <button key={m.key} type="button" onClick={() => setSplitType(m.key)}
                className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors
                  ${splitType === m.key ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                {m.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-1">{SPLIT_MODES.find((m) => m.key === splitType)?.desc}</p>
        </div>

        {/* Split among */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-gray-600">
              Split among
              {splitType === 'equal' && amtPaise > 0 && participants.length > 0
                ? ` · ${fmtShort(Math.floor(amtPaise / participants.length))} each`
                : ''}
            </p>
            <button type="button" onClick={() => setParticipants(allSelected ? [] : [...allPhones])}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors px-2 py-0.5 rounded-lg bg-indigo-50">
              {allSelected ? 'None' : 'All'}
            </button>
          </div>

          {errors.participants && <p className="text-red-500 text-xs mb-2">{errors.participants}</p>}
          {errors.split && <p className="text-red-500 text-xs mb-2">{errors.split}</p>}
          {hint && <p className="text-orange-500 text-xs mb-2">{hint}</p>}

          <div className="bg-white rounded-2xl shadow-sm divide-y divide-gray-100">
            {allMembers.map((m) => {
              const sel = participants.includes(m.phone);
              const share = splitMap[m.phone];
              return (
                <div key={m.phone} className="flex items-center gap-3 px-4 py-3">
                  <button type="button" onClick={() => toggleParticipant(m.phone)}
                    className="flex items-center gap-3 flex-1 text-left">
                    <Avatar name={m.name} size={36} />
                    <div className="flex-1">
                      <p className="text-gray-900 font-medium text-sm">
                        {m.phone === user?.phone ? 'You' : m.name}
                        {m.status === 'pending' && <span className="ml-1.5 text-xs text-gray-400 font-normal">(invited)</span>}
                      </p>
                      {sel && splitType === 'equal' && share !== undefined && (
                        <p className="text-xs text-indigo-600">{fmtShort(share)}</p>
                      )}
                      {!sel && <p className="text-xs text-gray-400">Not included</p>}
                    </div>
                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors shrink-0 ${sel ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300'}`}>
                      {sel && <span className="text-white text-xs font-bold">✓</span>}
                    </div>
                  </button>

                  {/* Custom split input */}
                  {sel && splitType !== 'equal' && (
                    <div className="w-24 shrink-0 ml-2">
                      <div className="relative">
                        {splitType === 'exact' && (
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">₹</span>
                        )}
                        {splitType === 'percentage' && (
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">%</span>
                        )}
                        <input type="number" min="0"
                          step={splitType === 'shares' ? '1' : '0.01'}
                          value={customSplits[m.phone] ?? ''}
                          onChange={(e) => setCustomSplits((prev) => ({ ...prev, [m.phone]: e.target.value }))}
                          placeholder={splitType === 'shares' ? '1' : '0'}
                          className={`w-full rounded-lg border border-gray-200 bg-gray-50 text-sm text-right px-2 py-1.5 focus:outline-none focus:border-indigo-500
                            ${splitType === 'exact' ? 'pl-5' : splitType === 'percentage' ? 'pr-5' : ''}`}
                        />
                        {share !== undefined && (
                          <p className="text-xs text-indigo-600 mt-0.5 text-right">{fmtShort(share)}</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {errors.submit && <p className="text-red-500 text-sm">{errors.submit}</p>}
        <Button type="submit" fullWidth size="lg" loading={loading}>Add Expense</Button>
      </form>
    </div>
  );
}

export default function AddExpensePage() {
  return (
    <AuthGuard>
      <AddExpenseContent />
    </AuthGuard>
  );
}
