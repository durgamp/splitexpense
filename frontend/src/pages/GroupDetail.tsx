import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { ExpenseItem } from '@/components/ExpenseItem';
import { BalanceSummary } from '@/components/BalanceSummary';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useGroupStore } from '@/store/group.store';
import { useExpenseStore } from '@/store/expense.store';
import { usePaymentStore } from '@/store/payment.store';
import { useAuthStore } from '@/store/auth.store';
import { useBalance } from '@/hooks/useBalance';
import { groupsApi, expensesApi, paymentsApi } from '@/services/api';
import { fmtShort } from '@/utils/format';
import type { Settlement, Payment } from '@/types';

/** Modal to rename or delete the group (creator only) */
function GroupSettingsModal({
  groupName,
  onRename,
  onDelete,
  onClose,
}: {
  groupName: string;
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
        <Input
          label="Group name"
          value={name}
          onChange={(e) => { setName(e.target.value); setError(''); }}
        />
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <Button fullWidth loading={renameLoading} onClick={submitRename}>Save name</Button>
        <div className="border-t border-gray-100 pt-3">
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="w-full py-2 text-sm font-medium text-red-500 hover:text-red-600 transition-colors">
              Delete group…
            </button>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-gray-600 text-center">This will permanently delete the group and all its expenses. Are you sure?</p>
              <div className="flex gap-3">
                <Button variant="ghost" fullWidth onClick={() => setConfirmDelete(false)}>Cancel</Button>
                <Button fullWidth loading={deleteLoading} onClick={submitDelete}
                  className="!bg-red-500 hover:!bg-red-600">Delete</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

type Tab = 'expenses' | 'balances';

function whatsappUrl(phone: string, text: string) {
  if (!/^\+[1-9]\d{6,14}$/.test(phone)) return null;
  return `https://wa.me/${phone.replace(/^\+/, '')}?text=${encodeURIComponent(text)}`;
}

/** Modal to record a real payment */
function SettleModal({
  settlement,
  onConfirm,
  onClose,
}: {
  settlement: Settlement;
  onConfirm: (amountRupees: number, notes: string) => Promise<void>;
  onClose: () => void;
}) {
  const defaultAmt = (settlement.amountPaise / 100).toFixed(2);
  const [amount, setAmount] = useState(defaultAmt);
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
        <Input
          label="Amount (₹)"
          value={amount}
          onChange={(e) => { setAmount(e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1')); setError(''); }}
          prefix="₹"
          inputMode="decimal"
          error={error}
        />
        <Input
          label="Note (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. Paid via UPI"
        />
        <div className="flex gap-3">
          <Button variant="ghost" fullWidth onClick={onClose}>Cancel</Button>
          <Button fullWidth loading={loading} onClick={submit}>Confirm</Button>
        </div>
      </div>
    </div>
  );
}

export default function GroupDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
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
    expenses,
    payments,
  );
  const myBalance = netBalances.find((b) => b.phone === myPhone)?.netPaise ?? 0;

  useEffect(() => {
    if (!id) return;
    Promise.all([
      groupsApi.get(id).then(({ data }) => upsertGroup(data.group)),
      expensesApi.list(id).then(({ data }) => setGroupExpenses(id, data.expenses)),
      paymentsApi.list(id).then(({ data }) => setGroupPayments(id, data.payments)),
    ]).catch((err) => console.error('[GroupDetail] load error:', err))
      .finally(() => setLoading(false));
  }, [id]);

  function inviteUrl() { return `${window.location.origin}/invite/${group?.inviteToken}`; }
  function inviteMessage(memberName?: string) {
    const target = memberName ? `Hey ${memberName}!` : 'Hey!';
    return `${target} ${myName} added you to "${group?.name}" on SplitEase.\n\nJoin here: ${inviteUrl()}`;
  }

  async function handleDeleteExpense(expenseId: string) {
    if (!id) return;
    try { await expensesApi.delete(id, expenseId); removeExpense(id, expenseId); }
    catch { /* ignore */ }
  }

  async function handleDeletePayment(paymentId: string) {
    if (!id) return;
    try { await paymentsApi.delete(id, paymentId); removePayment(id, paymentId); }
    catch { /* ignore */ }
  }

  async function handleConfirmSettle(amountRupees: number, notes: string) {
    if (!id || !settleTarget) return;
    const { data } = await paymentsApi.create(id, {
      fromPhone: settleTarget.fromPhone,
      toPhone: settleTarget.toPhone,
      amountRupees,
      notes: notes || undefined,
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
    navigate('/');
  }

  async function copyLink() {
    await navigator.clipboard.writeText(inviteUrl());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function shareWhatsApp(memberPhone?: string, memberName?: string) {
    const msg = inviteMessage(memberName);
    if (memberPhone) {
      const url = whatsappUrl(memberPhone, msg);
      if (url) window.open(url, '_blank');
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
    }
  }

  if (loading || !group) {
    return <Layout><div className="flex justify-center py-20 text-3xl text-gray-200">⏳</div></Layout>;
  }

  const activeMembers = group.members.filter((m) => m.status === 'active');
  const pendingMembers = group.members.filter((m) => m.status === 'pending');
  const balColor = myBalance > 0 ? 'text-green-600' : myBalance < 0 ? 'text-red-500' : 'text-gray-400';
  const nameMap = Object.fromEntries(group.members.map((m) => [m.phone, m.name]));
  const isCreator = group.createdBy === myId;

  return (
    <Layout>
      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 z-10">
        <button onClick={() => navigate('/')} className="text-gray-400 hover:text-gray-600 p-1">←</button>
        <div className="flex-1">
          <p className="font-bold text-gray-900">{group.name}</p>
          <p className="text-xs text-gray-400">{activeMembers.length} members{pendingMembers.length > 0 ? ` · ${pendingMembers.length} pending` : ''}</p>
        </div>
        {isCreator && (
          <button onClick={() => setShowSettings(true)}
            className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            title="Group settings">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        )}
        <button onClick={() => shareWhatsApp()}
          className="flex items-center gap-1.5 bg-[#25D366] text-white text-xs font-semibold px-3 py-1.5 rounded-full hover:bg-[#1ebe5d] transition-colors">
          <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
          Invite
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
            className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${tab === t ? 'bg-primary text-white' : 'bg-gray-100 text-gray-500'}`}>
            {t === 'expenses' ? `Expenses${expenses.length ? ` (${expenses.length})` : ''}` : 'Balances'}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="px-4 mt-3 pb-4">
        {tab === 'expenses' ? (
          <>
            <div className="bg-white rounded-2xl shadow-sm divide-y divide-gray-100">
              {expenses.length === 0 ? (
                <p className="text-center text-gray-400 py-10">No expenses yet</p>
              ) : expenses.map((e) => (
                <div key={e.id} className="px-4">
                  <ExpenseItem expense={e} group={group} myPhone={myPhone} onDelete={() => handleDeleteExpense(e.id)} />
                </div>
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
                    const isMine = p.createdBy === useAuthStore.getState().user?.id;
                    return (
                      <div key={p.id} className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-sm shrink-0">💸</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-700">
                            <span className="font-medium">{fromLabel}</span> paid <span className="font-medium">{toLabel}</span>
                          </p>
                          {p.notes && <p className="text-xs text-gray-400 truncate">{p.notes}</p>}
                          <p className="text-xs text-gray-400">{new Date(p.createdAt).toLocaleDateString()}</p>
                        </div>
                        <span className="text-sm font-bold text-green-600 shrink-0">{fmtShort(p.amountPaise)}</span>
                        {isMine && (
                          <button onClick={() => handleDeletePayment(p.id)}
                            className="text-gray-300 hover:text-red-400 transition-colors ml-1 shrink-0 text-lg leading-none">
                            ×
                          </button>
                        )}
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
              <BalanceSummary
                settlements={settlements}
                netBalances={netBalances}
                myPhone={myPhone}
                onSettle={(s) => setSettleTarget(s)}
              />
            </div>

            {/* Pending invites */}
            {pendingMembers.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm p-4">
                <p className="text-sm font-semibold text-gray-700 mb-3">Pending invites ({pendingMembers.length})</p>
                <div className="flex flex-col gap-2">
                  {pendingMembers.map((m) => (
                    <div key={m.phone} className="flex items-center gap-3">
                      <Avatar name={m.name} size={36} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{m.name}</p>
                        <p className="text-xs text-gray-400">{m.phone}</p>
                      </div>
                      <button onClick={() => shareWhatsApp(m.phone, m.name)}
                        className="flex items-center gap-1.5 bg-[#25D366] text-white text-xs font-semibold px-3 py-1.5 rounded-full hover:bg-[#1ebe5d] transition-colors shrink-0">
                        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                        Invite
                      </button>
                    </div>
                  ))}
                </div>
                <button onClick={copyLink} className="mt-3 w-full text-center text-xs text-gray-400 hover:text-primary transition-colors py-1">
                  {copied ? '✓ Link copied!' : 'Or copy invite link'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* FAB */}
      <button onClick={() => navigate(`/group/${id}/add-expense`)}
        className="fixed bottom-24 right-4 z-20 w-14 h-14 rounded-full bg-primary text-white text-3xl font-light shadow-lg hover:bg-primary-dark transition-colors flex items-center justify-center">
        +
      </button>

      {/* Settle modal */}
      {settleTarget && (
        <SettleModal
          settlement={settleTarget}
          onConfirm={handleConfirmSettle}
          onClose={() => setSettleTarget(null)}
        />
      )}

      {/* Group settings modal (creator only) */}
      {showSettings && (
        <GroupSettingsModal
          groupName={group.name}
          onRename={handleRenameGroup}
          onDelete={handleDeleteGroup}
          onClose={() => setShowSettings(false)}
        />
      )}
    </Layout>
  );
}
