'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Layout } from '@/components/Layout';
import { AuthGuard } from '@/components/AuthGuard';
import { Avatar } from '@/components/ui/Avatar';
import { groupsApi } from '@/services/api';
import { useGroupStore } from '@/store/group.store';
import { useAuthStore } from '@/store/auth.store';
import { fmtShort } from '@/utils/format';
import { useMyBalance } from '@/hooks/useBalance';
import { useExpenseStore } from '@/store/expense.store';
import { usePaymentStore } from '@/store/payment.store';
import type { Group } from '@/types';

function GroupCard({ group }: { group: Group }) {
  const myPhone = useAuthStore((s) => s.user?.phone ?? '');
  const expenses = useExpenseStore((s) => s.getGroupExpenses(group.id));
  const payments = usePaymentStore((s) => s.getGroupPayments(group.id));
  const myBalance = useMyBalance(group, expenses, myPhone, payments);
  const balColor = myBalance > 0 ? 'text-green-600' : myBalance < 0 ? 'text-red-500' : 'text-gray-400';

  return (
    <Link href={`/group/${group.id}`}
      className="bg-white rounded-2xl p-4 shadow-sm flex items-center gap-3 hover:shadow-md transition-shadow active:scale-[.99]">
      <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-lg shrink-0">
        {group.name[0].toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-900 truncate">{group.name}</p>
        <p className="text-xs text-gray-400">
          {group.members.filter((m) => m.status === 'active').length} members
        </p>
      </div>
      {myBalance !== 0 && (
        <span className={`text-sm font-bold shrink-0 ${balColor}`}>
          {myBalance > 0 ? `+${fmtShort(myBalance)}` : `-${fmtShort(Math.abs(myBalance))}`}
        </span>
      )}
    </Link>
  );
}

function Dashboard() {
  const router = useRouter();
  const { groups, loading, setGroups, setLoading, setError } = useGroupStore();
  const { user } = useAuthStore();

  useEffect(() => {
    setLoading(true);
    groupsApi.list()
      .then(({ data }) => setGroups(data.groups))
      .catch((err) => setError(err?.message ?? 'Failed to load groups'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Layout>
      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between z-10">
        <div>
          <h1 className="text-lg font-bold text-gray-900">My Groups</h1>
          <p className="text-xs text-gray-400">Hi, {user?.name?.split(' ')[0] ?? 'there'}</p>
        </div>
        <Avatar name={user?.name ?? '?'} size={36} />
      </div>

      <div className="p-4 flex flex-col gap-3">
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : groups.length === 0 ? (
          <div className="text-center py-20 flex flex-col items-center gap-4">
            <span className="text-6xl">🧾</span>
            <p className="text-gray-500 font-medium">No groups yet</p>
            <p className="text-gray-400 text-sm">Create a group to start splitting expenses.</p>
            <button
              onClick={() => router.push('/group/new')}
              className="mt-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold text-sm hover:bg-indigo-700 transition-colors">
              Create a Group
            </button>
          </div>
        ) : (
          groups.map((g) => <GroupCard key={g.id} group={g} />)
        )}
      </div>

      {/* FAB */}
      {groups.length > 0 && (
        <button
          onClick={() => router.push('/group/new')}
          className="fixed bottom-24 right-4 z-20 w-14 h-14 rounded-full bg-indigo-600 text-white text-3xl font-light shadow-lg hover:bg-indigo-700 transition-colors flex items-center justify-center">
          +
        </button>
      )}
    </Layout>
  );
}

export default function DashboardPage() {
  return (
    <AuthGuard>
      <Dashboard />
    </AuthGuard>
  );
}
