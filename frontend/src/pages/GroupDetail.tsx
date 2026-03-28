import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { ExpenseItem } from '@/components/ExpenseItem';
import { BalanceSummary } from '@/components/BalanceSummary';
import { Avatar } from '@/components/ui/Avatar';
import { useGroupStore } from '@/store/group.store';
import { useExpenseStore } from '@/store/expense.store';
import { useAuthStore } from '@/store/auth.store';
import { useBalance } from '@/hooks/useBalance';
import { groupsApi, expensesApi } from '@/services/api';
import { fmtShort } from '@/utils/format';
import type { Settlement } from '@/types';

type Tab = 'expenses' | 'balances';

function whatsappUrl(phone: string, text: string) {
  // Validate E.164 format before building URL to prevent injection
  if (!/^\+[1-9]\d{6,14}$/.test(phone)) return null;
  const num = phone.replace(/^\+/, '');
  return `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
}

export default function GroupDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const myPhone = useAuthStore((s) => s.user?.phone ?? '');
  const myName = useAuthStore((s) => s.user?.name ?? '');
  const { upsertGroup, getById } = useGroupStore();
  const { setGroupExpenses, getGroupExpenses, upsertExpense, removeExpense } = useExpenseStore();
  const [tab, setTab] = useState<Tab>('expenses');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const group = getById(id ?? '');
  const expenses = getGroupExpenses(id ?? '');
  const { netBalances, settlements, totalSpendPaise } = useBalance(
    group ?? { id: '', name: '', members: [], createdBy: '', createdAt: 0, inviteToken: '', inviteTokenCreatedAt: 0 },
    expenses
  );
  const myBalance = netBalances.find((b) => b.phone === myPhone)?.netPaise ?? 0;

  useEffect(() => {
    if (!id) return;
    Promise.all([
      groupsApi.get(id).then(({ data }) => upsertGroup(data.group)),
      expensesApi.list(id).then(({ data }) => setGroupExpenses(id, data.expenses)),
    ]).catch((err) => {
      console.error('[GroupDetail] Failed to load:', err);
    }).finally(() => setLoading(false));
  }, [id]);

  function inviteUrl() {
    return `${window.location.origin}/invite/${group?.inviteToken}`;
  }

  function inviteMessage(memberName?: string) {
    const target = memberName ? `Hey ${memberName}!` : 'Hey!';
    return `${target} ${myName} added you to "${group?.name}" on SplitEase — the easiest way to split expenses.\n\nJoin here: ${inviteUrl()}`;
  }

  async function handleDeleteExpense(expenseId: string) {
    if (!id) return;
    try {
      await expensesApi.delete(id, expenseId);
      removeExpense(id, expenseId);
    } catch { /* silently ignore */ }
  }

  async function handleSettle(s: Settlement) {
    if (!id) return;
    try {
      const { data } = await expensesApi.create(id, {
        description: '💸 Settlement',
        amountRupees: s.amountPaise / 100,
        paidByPhone: s.fromPhone,
        participantPhones: [s.toPhone],
        category: 'other',
      });
      upsertExpense(data.expense);
    } catch (err) {
      console.error('[GroupDetail] Settlement failed:', err);
    }
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
      // Generic — let user pick the chat
      window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
    }
  }

  if (loading || !group) {
    return <Layout><div className="flex justify-center py-20 text-3xl text-gray-200">⏳</div></Layout>;
  }

  const activeMembers = group.members.filter((m) => m.status === 'active');
  const pendingMembers = group.members.filter((m) => m.status === 'pending');
  const balColor = myBalance > 0 ? 'text-green-600' : myBalance < 0 ? 'text-red-500' : 'text-gray-400';

  return (
    <Layout>
      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 z-10">
        <button onClick={() => navigate('/')} className="text-gray-400 hover:text-gray-600 p-1">←</button>
        <div className="flex-1">
          <p className="font-bold text-gray-900">{group.name}</p>
          <p className="text-xs text-gray-400">{activeMembers.length} members{pendingMembers.length > 0 ? ` · ${pendingMembers.length} pending` : ''}</p>
        </div>
        <button onClick={() => shareWhatsApp()}
          title="Invite via WhatsApp"
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
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="px-4 mt-3 pb-4">
        {tab === 'expenses' ? (
          <div className="bg-white rounded-2xl shadow-sm divide-y divide-gray-100">
            {expenses.length === 0 ? (
              <p className="text-center text-gray-400 py-10">No expenses yet</p>
            ) : expenses.map((e) => (
              <div key={e.id} className="px-4">
                <ExpenseItem expense={e} group={group} myPhone={myPhone} onDelete={() => handleDeleteExpense(e.id)} />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <BalanceSummary settlements={settlements} netBalances={netBalances} myPhone={myPhone} onSettle={handleSettle} />
            </div>

            {/* Pending members — invite via WhatsApp */}
            {pendingMembers.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm p-4">
                <p className="text-sm font-semibold text-gray-700 mb-3">
                  Pending invites ({pendingMembers.length})
                </p>
                <div className="flex flex-col gap-2">
                  {pendingMembers.map((m) => (
                    <div key={m.phone} className="flex items-center gap-3">
                      <Avatar name={m.name} size={36} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{m.name}</p>
                        <p className="text-xs text-gray-400">{m.phone}</p>
                      </div>
                      <button
                        onClick={() => shareWhatsApp(m.phone, m.name)}
                        className="flex items-center gap-1.5 bg-[#25D366] text-white text-xs font-semibold px-3 py-1.5 rounded-full hover:bg-[#1ebe5d] transition-colors shrink-0">
                        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                        Invite
                      </button>
                    </div>
                  ))}
                </div>

                {/* Copy link option */}
                <button onClick={copyLink}
                  className="mt-3 w-full text-center text-xs text-gray-400 hover:text-primary transition-colors py-1">
                  {copied ? '✓ Link copied!' : 'Or copy invite link'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* FAB */}
      <button onClick={() => navigate(`/group/${id}/add-expense`)}
        className="fixed bottom-24 right-4 w-14 h-14 rounded-full bg-primary text-white text-3xl font-light shadow-lg hover:bg-primary-dark transition-colors flex items-center justify-center">
        +
      </button>
    </Layout>
  );
}
