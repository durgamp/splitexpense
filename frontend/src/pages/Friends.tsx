import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useGroupStore } from '@/store/group.store';
import { useExpenseStore } from '@/store/expense.store';
import { usePaymentStore } from '@/store/payment.store';
import { useAuthStore } from '@/store/auth.store';
import { useBalance } from '@/hooks/useBalance';
import { friendsApi, groupsApi, expensesApi, paymentsApi } from '@/services/api';
import { fmtShort } from '@/utils/format';
import type { Group } from '@/types';

function FriendItem({ group, myPhone }: { group: Group; myPhone: string }) {
  const navigate = useNavigate();
  const expenses = useExpenseStore((s) => s.getGroupExpenses(group.id));
  const payments = usePaymentStore((s) => s.getGroupPayments(group.id));
  const { netBalances } = useBalance(group, expenses, payments);
  const myNet = netBalances.find((b) => b.phone === myPhone)?.netPaise ?? 0;

  const other = group.members.find((m) => m.phone !== myPhone) ?? group.members[0];
  const balColor = myNet > 0 ? 'text-green-600' : myNet < 0 ? 'text-red-500' : 'text-gray-400';
  const balLabel = myNet > 0
    ? `they owe you ${fmtShort(myNet)}`
    : myNet < 0
    ? `you owe ${fmtShort(Math.abs(myNet))}`
    : 'settled up';

  return (
    <button
      onClick={() => navigate(`/group/${group.id}`)}
      className="flex items-center gap-3 px-4 py-3 text-left w-full hover:bg-gray-50 transition-colors"
    >
      <Avatar name={other?.name ?? '?'} size={44} />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-900 truncate">{other?.name ?? 'Unknown'}</p>
        <p className={`text-xs ${balColor}`}>{balLabel}</p>
      </div>
      {myNet !== 0 && (
        <span className={`text-sm font-bold shrink-0 ${balColor}`}>
          {myNet > 0 ? '+' : '-'}{fmtShort(Math.abs(myNet))}
        </span>
      )}
    </button>
  );
}

/** Sheet to add a new direct friend connection */
function AddFriendSheet({ onClose, onAdded }: { onClose: () => void; onAdded: (groupId: string) => void }) {
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function submit() {
    const errs: Record<string, string> = {};
    if (!phone.match(/^\+[1-9]\d{6,14}$/)) errs.phone = 'Enter a valid international phone number (e.g. +919876543210)';
    if (!name.trim()) errs.name = 'Enter their name';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setLoading(true);
    try {
      const { data } = await friendsApi.add(phone.trim(), name.trim());
      onAdded(data.friend?.id ?? data.groupId);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number; data?: { groupId?: string } } })?.response?.status;
      if (status === 409) {
        const groupId = (err as { response?: { data?: { groupId?: string } } })?.response?.data?.groupId;
        if (groupId) { onAdded(groupId); return; }
      }
      setErrors({ submit: 'Failed to add friend' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center" onClick={onClose}>
      <div className="bg-white rounded-t-2xl w-full max-w-lg p-6 flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-bold text-gray-900 text-lg">Add a Friend</h3>
        <p className="text-sm text-gray-500">Track expenses directly with one person, without creating a group.</p>
        <Input
          label="Their phone number"
          value={phone}
          onChange={(e) => { setPhone(e.target.value); setErrors((v) => ({ ...v, phone: '' })); }}
          placeholder="+919876543210"
          inputMode="tel"
          error={errors.phone}
          autoFocus
        />
        <Input
          label="Their name"
          value={name}
          onChange={(e) => { setName(e.target.value); setErrors((v) => ({ ...v, name: '' })); }}
          placeholder="What do you call them?"
          error={errors.name}
        />
        {errors.submit && <p className="text-red-500 text-sm">{errors.submit}</p>}
        <div className="flex gap-3">
          <Button variant="ghost" fullWidth onClick={onClose}>Cancel</Button>
          <Button fullWidth loading={loading} onClick={submit}>Add Friend</Button>
        </div>
      </div>
    </div>
  );
}

export default function Friends() {
  const navigate = useNavigate();
  const myPhone = useAuthStore((s) => s.user?.phone ?? '');
  const { groups, setGroups } = useGroupStore();
  const { setGroupExpenses } = useExpenseStore();
  const { setGroupPayments } = usePaymentStore();
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const friends = groups.filter((g) => g.type === 'direct');

  useEffect(() => {
    Promise.all([
      groupsApi.list().then(({ data }) => {
        setGroups(data.groups);
        return data.groups;
      }),
      // also load direct groups from friends endpoint to ensure they are in the store
      friendsApi.list().then(({ data }) => (data.friends ?? data.groups ?? []) as Group[]),
    ]).then(([allGroups, directGroups]) => {
      // Merge direct groups into store if not already present
      const allIds = new Set(allGroups.map((g: Group) => g.id));
      const missing = directGroups.filter((g) => !allIds.has(g.id));
      if (missing.length) setGroups([...allGroups, ...missing]);

      // Pre-fetch expenses + payments for direct groups
      const directs = [...allGroups.filter((g: Group) => g.type === 'direct'), ...missing];
      directs.forEach((g) => {
        expensesApi.list(g.id).then((r) => setGroupExpenses(g.id, r.data.expenses)).catch(() => {});
        paymentsApi.list(g.id).then((r) => setGroupPayments(g.id, r.data.payments)).catch(() => {});
      });
    }).catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  function handleAdded(groupId: string) {
    setShowAdd(false);
    navigate(`/group/${groupId}`);
  }

  return (
    <Layout>
      <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between z-10">
        <div>
          <p className="text-lg font-bold text-gray-900">Friends</p>
          <p className="text-sm text-gray-400">Direct expenses</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center text-xl font-light hover:bg-primary-dark transition-colors"
        >
          +
        </button>
      </div>

      <div className="p-4 flex flex-col gap-3">
        {loading && friends.length === 0 && (
          <div className="flex justify-center py-16 text-gray-300 text-4xl">⏳</div>
        )}

        {friends.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm divide-y divide-gray-100">
            {friends.map((g) => (
              <FriendItem key={g.id} group={g} myPhone={myPhone} />
            ))}
          </div>
        )}

        {!loading && friends.length === 0 && (
          <div className="flex flex-col items-center pt-20 gap-4 text-center">
            <span className="text-6xl">🤝</span>
            <h3 className="text-xl font-bold text-gray-900">No friends yet</h3>
            <p className="text-gray-400 text-sm max-w-xs">Add a friend to track direct expenses between just the two of you.</p>
            <button
              onClick={() => setShowAdd(true)}
              className="bg-primary text-white px-6 py-3 rounded-xl font-semibold text-sm hover:bg-primary-dark transition-colors"
            >
              Add your first friend
            </button>
          </div>
        )}
      </div>

      {showAdd && <AddFriendSheet onClose={() => setShowAdd(false)} onAdded={handleAdded} />}
    </Layout>
  );
}
