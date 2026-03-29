import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { GroupCard } from '@/components/GroupCard';
import { useGroupStore } from '@/store/group.store';
import { useExpenseStore } from '@/store/expense.store';
import { useAuthStore } from '@/store/auth.store';
import { useBalance } from '@/hooks/useBalance';
import { groupsApi, expensesApi } from '@/services/api';
import type { Group } from '@/types';

function GroupItem({ group, myPhone }: { group: Group; myPhone: string }) {
  const expenses = useExpenseStore((s) => s.getGroupExpenses(group.id));
  const { netBalances } = useBalance(group, expenses);
  const myNet = netBalances.find((b) => b.phone === myPhone)?.netPaise ?? 0;
  const navigate = useNavigate();
  return <GroupCard group={group} myNetPaise={myNet} onClick={() => navigate(`/group/${group.id}`)} />;
}

export default function Groups() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { groups, loading, setGroups, setLoading } = useGroupStore();
  const { setGroupExpenses } = useExpenseStore();

  useEffect(() => {
    setLoading(true);
    groupsApi.list().then(({ data }) => {
      setGroups(data.groups);
      // Pre-fetch expenses for each group (fire-and-forget; errors silently keep balance at 0)
      data.groups.forEach((g: Group) =>
        expensesApi.list(g.id)
          .then((r) => setGroupExpenses(g.id, r.data.expenses))
          .catch(() => { /* balance shows 0 until next load */ })
      );
    }).finally(() => setLoading(false));
  }, []);

  return (
    <Layout>
      <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between z-10">
        <div>
          <p className="text-lg font-bold text-gray-900">Hey, {user?.name?.split(' ')[0]} 👋</p>
          <p className="text-sm text-gray-400">Your groups</p>
        </div>
        <button onClick={() => navigate('/group/new')}
          className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center text-xl font-light hover:bg-primary-dark transition-colors">
          +
        </button>
      </div>

      <div className="p-4 flex flex-col gap-3">
        {loading && groups.length === 0 && (
          <div className="flex justify-center py-16 text-gray-300 text-4xl">⏳</div>
        )}

        {groups.map((g) => (
          <GroupItem key={g.id} group={g} myPhone={user?.phone ?? ''} />
        ))}

        {!loading && groups.length === 0 && (
          <div className="flex flex-col items-center pt-20 gap-4 text-center">
            <span className="text-6xl">🤝</span>
            <h3 className="text-xl font-bold text-gray-900">No groups yet</h3>
            <p className="text-gray-400 text-sm max-w-xs">Create a group to start splitting expenses with friends.</p>
            <button onClick={() => navigate('/group/new')}
              className="bg-primary text-white px-6 py-3 rounded-xl font-semibold text-sm hover:bg-primary-dark transition-colors">
              Create your first group
            </button>
          </div>
        )}
      </div>
    </Layout>
  );
}
