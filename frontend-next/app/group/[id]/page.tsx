'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Layout } from '@/components/Layout';
import { AuthGuard } from '@/components/AuthGuard';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { groupsApi, expensesApi, paymentsApi } from '@/services/api';
import { useGroupStore } from '@/store/group.store';
import { useExpenseStore } from '@/store/expense.store';
import { usePaymentStore } from '@/store/payment.store';
import { useAuthStore } from '@/store/auth.store';
import { useBalance } from '@/hooks/useBalance';
import { fmtShort, fmtDateShort } from '@/utils/format';
import type { Settlement, Payment, Expense } from '@/types';

// ── Category emoji map ────────────────────────────────────────────────────────
const CAT_EMOJI: Record<string, string> = {
  food: '🍽️', transport: '🚗', accommodation: '🏠',
  entertainment: '🎬', utilities: '💡', shopping: '🛍️', other: '📌',
};

// ── Expense row ───────────────────────────────────────────────────────────────
function ExpenseRow({ expense, nameMap, myPhone, onDelete }: {
  expense: Expense;
  nameMap: Record<string, string>;
  myPhone: string;
  onDelete: () => void;
}) {
  const myShare = expense.shares.find((s) => s.phone === myPhone);
  const iMine = expense.paidByPhone === myPhone;
  const paidByLabel = iMine ? 'You' : nameMap[expense.paidByPhone] ?? expense.paidByPhone;

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-lg shrink-0">
        {CAT_EMOJI[expense.category] ?? '📌'}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{expense.description}</p>
        <p className="text-xs text-gray-400">
          {paidByLabel} paid · {fmtDateShort(expense.createdAt)}
        </p>
        {expense.notes && <p className="text-xs text-gray-400 truncate">{expense.notes}</p>}
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-bold text-gray-900">{fmtShort(expense.amountPaise)}</p>
        {myShare && (
          <p className={`text-xs ${iMine ? 'text-green-600' : 'text-red-500'}`}>
            {iMine ? `you lent ${fmtShort(expense.amountPaise - myShare.amountPaise)}` : `you owe ${fmtShort(myShare.amountPaise)}`}
          </p>
        )}
      </div>
      <button onClick={onDelete} className="text-gray-300 hover:text-red-400 transition-colors text-xl leading-none ml-1 shrink-0">×</button>
    </div>
  );
}

// ── Group Settings modal ──────────────────────────────────────────────────────
function GroupSettingsModal({ groupName, isAdmin, isCreator, onRename, onDelete, onClose }: {
  groupName: string;
  isAdmin: boolean;
  isCreator: boolean;
  onRename: (name: string) => Promise<void>;
  onDelete: () => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(groupName);
  const [renameLoading, setRenameLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');

  async function submitRename() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === groupName) { onClose(); return; }
    setRenameLoading(true);
    try { await onRename(trimmed); onClose(); }
    catch { setError('Failed to rename group'); }
    finally { setRenameLoading(false); }
  }

  async function submitDelete() {
    setDeleteLoading(true);
    try { await onDelete(); }
    catch { setError('Failed to delete group'); setDeleteLoading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center" onClick={onClose}>
      <div className="bg-white rounded-t-2xl w-full max-w-lg p-6 flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-bold text-gray-900 text-lg">Group Settings</h3>
        {isAdmin && (
          <>
            <Input label="Group name" value={name} onChange={(e) => { setName(e.target.value); setError(''); }} />
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <Button fullWidth loading={renameLoading} onClick={submitRename}>Save name</Button>
          </>
        )}
        {isCreator && (
          <div className="border-t border-gray-100 pt-3">
            {!confirmDelete ? (
              <button onClick={() => setConfirmDelete(true)}
                className="w-full py-2 text-sm font-medium text-red-500 hover:text-red-600 transition-colors">
                Delete group…
              </button>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-gray-600 text-center">
                  This will permanently delete the group and all its expenses. Are you sure?
                </p>
                <div className="flex gap-3">
                  <Button variant="ghost" fullWidth onClick={() => setConfirmDelete(false)}>Cancel</Button>
                  <Button variant="danger" fullWidth loading={deleteLoading} onClick={submitDelete}>Delete</Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Settle modal ──────────────────────────────────────────────────────────────
function SettleModal({ settlement, onConfirm, onClose }: {
  settlement: Settlement;
  onConfirm: (amountRupees: number, notes: string) => Promise<void>;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState((settlement.amountPaise / 100).toFixed(2));
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) { setError('Enter a valid amount'); return; }
    setLoading(true);
    try { await onConfirm(amt, notes); }
    catch { setError('Failed to record payment'); }
    finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center" onClick={onClose}>
      <div className="bg-white rounded-t-2xl w-full max-w-lg p-6 flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-bold text-gray-900 text-lg">Record Payment</h3>
        <p className="text-sm text-gray-500">
          <span className="font-medium text-gray-900">{settlement.fromName}</span> pays{' '}
          <span className="font-medium text-gray-900">{settlement.toName}</span>
        </p>
        <Input label="Amount (₹)" value={amount}
          onChange={(e) => { setAmount(e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1')); setError(''); }}
          prefix="₹" inputMode="decimal" error={error} />
        <Input label="Note (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Paid via UPI" />
        <div className="flex gap-3">
          <Button variant="ghost" fullWidth onClick={onClose}>Cancel</Button>
          <Button fullWidth loading={loading} onClick={submit}>Confirm</Button>
        </div>
      </div>
    </div>
  );
}

// ── Balance summary ───────────────────────────────────────────────────────────
function BalanceSummary({ settlements, myPhone, onSettle }: {
  settlements: Settlement[];
  myPhone: string;
  onSettle: (s: Settlement) => void;
}) {
  if (settlements.length === 0) {
    return <p className="text-center text-gray-400 py-6 text-sm">All settled up! 🎉</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Settlements</p>
      {settlements.map((s, i) => {
        const isMe = s.fromPhone === myPhone || s.toPhone === myPhone;
        return (
          <div key={i} className="flex items-center gap-2">
            <Avatar name={s.fromName} size={32} />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-700">
                <span className="font-medium">{s.fromPhone === myPhone ? 'You' : s.fromName}</span>
                {' → '}
                <span className="font-medium">{s.toPhone === myPhone ? 'you' : s.toName}</span>
              </p>
              <p className="text-xs font-bold text-indigo-600">{fmtShort(s.amountPaise)}</p>
            </div>
            {isMe && (
              <button onClick={() => onSettle(s)}
                className="text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-lg transition-colors shrink-0">
                Settle
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
type Tab = 'expenses' | 'balances';

function GroupDetailContent() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const myId = useAuthStore((s) => s.user?.id ?? '');
  const myPhone = useAuthStore((s) => s.user?.phone ?? '');
  const myName = useAuthStore((s) => s.user?.name ?? '');
  const { upsertGroup, getById, removeGroup } = useGroupStore();
  const { setGroupExpenses, getGroupExpenses, removeExpense } = useExpenseStore();
  const { setGroupPayments, getGroupPayments, addPayment, removePayment } = usePaymentStore();

  const [tab, setTab] = useState<Tab>('expenses');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [settleTarget, setSettleTarget] = useState<Settlement | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const group = getById(id ?? '');
  const expenses = getGroupExpenses(id ?? '');
  const payments = getGroupPayments(id ?? '');
  const { netBalances, settlements, totalSpendPaise } = useBalance(
    group ?? { id: '', name: '', type: 'group', members: [], createdBy: '', createdAt: 0, inviteToken: '', inviteTokenCreatedAt: 0 },
    expenses, payments,
  );
  const myBalance = netBalances.find((b) => b.phone === myPhone)?.netPaise ?? 0;
  const balColor = myBalance > 0 ? 'text-green-600' : myBalance < 0 ? 'text-red-500' : 'text-gray-400';

  useEffect(() => {
    if (!id) return;
    Promise.all([
      groupsApi.get(id).then(({ data }) => upsertGroup(data.group)),
      expensesApi.list(id).then(({ data }) => setGroupExpenses(id, data.expenses)),
      paymentsApi.list(id).then(({ data }) => setGroupPayments(id, data.payments)),
    ]).catch(console.error).finally(() => setLoading(false));
  }, [id]);

  function inviteUrl() { return `${window.location.origin}/invite/${group?.inviteToken}`; }

  async function copyLink() {
    await navigator.clipboard.writeText(inviteUrl());
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }

  async function handleDeleteExpense(eid: string) {
    if (!id) return;
    try { await expensesApi.delete(id, eid); removeExpense(id, eid); } catch { /* ignore */ }
  }

  async function handleDeletePayment(pid: string) {
    if (!id) return;
    try { await paymentsApi.delete(id, pid); removePayment(id, pid); } catch { /* ignore */ }
  }

  async function handleConfirmSettle(amountRupees: number, notes: string) {
    if (!id || !settleTarget) return;
    const { data } = await paymentsApi.create(id, {
      fromPhone: settleTarget.fromPhone, toPhone: settleTarget.toPhone,
      amountRupees, notes: notes || undefined,
    });
    addPayment(data.payment);
    setSettleTarget(null);
  }

  async function handleRenameGroup(name: string) {
    if (!id) return;
    const { data } = await groupsApi.rename(id, name);
    upsertGroup(data.group);
  }

  async function handleDeleteGroup() {
    if (!id) return;
    await groupsApi.delete(id);
    removeGroup(id);
    router.replace('/dashboard');
  }

  if (loading || !group) {
    return (
      <Layout>
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </Layout>
    );
  }

  const nameMap = Object.fromEntries(group.members.map((m) => [m.phone, m.name]));
  const activeMembers = group.members.filter((m) => m.status === 'active');
  const pendingMembers = group.members.filter((m) => m.status === 'pending');
  const isCreator = group.createdBy === myId;
  const isAdmin = group.members.find((m) => m.phone === myPhone)?.role === 'admin';

  return (
    <Layout>
      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 z-10">
        <button onClick={() => router.push('/dashboard')} className="text-gray-400 hover:text-gray-600 p-1 text-xl">←</button>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-900 truncate">{group.name}</p>
          <p className="text-xs text-gray-400">
            {activeMembers.length} members{pendingMembers.length > 0 ? ` · ${pendingMembers.length} pending` : ''}
          </p>
        </div>
        {(isCreator || isAdmin) && (
          <button onClick={() => setShowSettings(true)}
            className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors" title="Group settings">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        )}
        <button onClick={copyLink}
          className="text-xs font-semibold px-3 py-1.5 rounded-full bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shrink-0">
          {copied ? '✓ Copied' : 'Invite'}
        </button>
      </div>

      {/* Summary */}
      <div className="mx-4 mt-4 bg-white rounded-2xl p-4 shadow-sm flex divide-x divide-gray-100">
        <div className="flex-1 flex flex-col items-center gap-1">
          <span className="text-xs text-gray-400">Total spend</span>
          <span className="text-xl font-bold text-gray-900">{fmtShort(totalSpendPaise)}</span>
        </div>
        <div className="flex-1 flex flex-col items-center gap-1">
          <span className="text-xs text-gray-400">Your balance</span>
          <span className={`text-xl font-bold ${balColor}`}>
            {myBalance > 0 ? `+${fmtShort(myBalance)}` : myBalance < 0 ? `-${fmtShort(Math.abs(myBalance))}` : '–'}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 px-4 mt-4">
        {(['expenses', 'balances'] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${tab === t ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
            {t === 'expenses' ? `Expenses${expenses.length ? ` (${expenses.filter(e => !e.deletedAt).length})` : ''}` : 'Balances'}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="px-4 mt-3 pb-4">
        {tab === 'expenses' ? (
          <>
            <div className="bg-white rounded-2xl shadow-sm divide-y divide-gray-100">
              {expenses.filter((e: Expense) => !e.deletedAt).length === 0 ? (
                <p className="text-center text-gray-400 py-10">No expenses yet</p>
              ) : expenses.filter((e: Expense) => !e.deletedAt).map((e: Expense) => (
                <ExpenseRow key={e.id} expense={e} nameMap={nameMap} myPhone={myPhone}
                  onDelete={() => handleDeleteExpense(e.id)} />
              ))}
            </div>

            {/* Payment history */}
            {payments.length > 0 && (
              <div className="mt-3 bg-white rounded-2xl shadow-sm p-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Payments recorded</p>
                <div className="flex flex-col gap-2">
                  {payments.map((p: Payment) => {
                    const fromLabel = p.fromPhone === myPhone ? 'You' : nameMap[p.fromPhone] ?? p.fromPhone;
                    const toLabel = p.toPhone === myPhone ? 'you' : nameMap[p.toPhone] ?? p.toPhone;
                    return (
                      <div key={p.id} className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-sm shrink-0">💸</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-700">
                            <span className="font-medium">{fromLabel}</span> paid{' '}
                            <span className="font-medium">{toLabel}</span>
                          </p>
                          {p.notes && <p className="text-xs text-gray-400 truncate">{p.notes}</p>}
                        </div>
                        <span className="text-sm font-bold text-green-600 shrink-0">{fmtShort(p.amountPaise)}</span>
                        <button onClick={() => handleDeletePayment(p.id)}
                          className="text-gray-300 hover:text-red-400 transition-colors ml-1 shrink-0 text-xl leading-none">×</button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <BalanceSummary settlements={settlements} myPhone={myPhone} onSettle={setSettleTarget} />
            </div>
            {/* Net balances */}
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Net Balances</p>
              <div className="flex flex-col gap-2">
                {netBalances.map((b) => (
                  <div key={b.phone} className="flex items-center gap-3">
                    <Avatar name={b.name} size={32} />
                    <span className="flex-1 text-sm text-gray-700 font-medium">
                      {b.phone === myPhone ? 'You' : b.name}
                    </span>
                    <span className={`text-sm font-bold ${b.netPaise > 0 ? 'text-green-600' : b.netPaise < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                      {b.netPaise > 0 ? `+${fmtShort(b.netPaise)}` : b.netPaise < 0 ? `-${fmtShort(Math.abs(b.netPaise))}` : '–'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Members */}
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Members</p>
              <div className="flex flex-col gap-2">
                {activeMembers.map((m) => (
                  <div key={m.phone} className="flex items-center gap-3">
                    <Avatar name={m.name} size={32} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{m.phone === myPhone ? 'You' : m.name}</p>
                      <p className="text-xs text-gray-400">{m.phone}</p>
                    </div>
                    {m.role === 'admin' && (
                      <span className="text-xs text-indigo-600 font-medium bg-indigo-50 px-2 py-0.5 rounded-full">admin</span>
                    )}
                  </div>
                ))}
                {pendingMembers.map((m) => (
                  <div key={m.phone} className="flex items-center gap-3 opacity-60">
                    <Avatar name={m.name} size={32} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{m.name}</p>
                      <p className="text-xs text-gray-400">Pending · {m.phone}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* FAB */}
      <button onClick={() => router.push(`/group/${id}/add-expense`)}
        className="fixed bottom-24 right-4 z-20 w-14 h-14 rounded-full bg-indigo-600 text-white text-3xl font-light shadow-lg hover:bg-indigo-700 transition-colors flex items-center justify-center">
        +
      </button>

      {settleTarget && (
        <SettleModal settlement={settleTarget} onConfirm={handleConfirmSettle} onClose={() => setSettleTarget(null)} />
      )}
      {showSettings && (
        <GroupSettingsModal
          groupName={group.name}
          isAdmin={isAdmin}
          isCreator={isCreator}
          onRename={handleRenameGroup}
          onDelete={handleDeleteGroup}
          onClose={() => setShowSettings(false)}
        />
      )}
    </Layout>
  );
}

export default function GroupDetailPage() {
  return (
    <AuthGuard>
      <GroupDetailContent />
    </AuthGuard>
  );
}
