import { useEffect, useState } from 'react';
import { Layout } from '@/components/Layout';
import { analyticsApi } from '@/services/api';
import { fmtShort, fmtMonthDisplay } from '@/utils/format';

const CAT_LABELS: Record<string, string> = {
  food: '🍽️ Food', transport: '🚗 Transport', accommodation: '🏠 Stay',
  entertainment: '🎬 Fun', utilities: '💡 Bills', shopping: '🛍️ Shopping', other: '📌 Other',
};

interface AnalyticsData {
  totalPaidPaise: number;
  totalSharePaise: number;
  monthly: { month: string; paise: number }[];
  byCategory: { category: string; paise: number }[];
  byGroup: { groupId: string; name: string; paise: number }[];
}

export default function Analytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    analyticsApi.get()
      .then(({ data: d }) => setData(d))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Layout><div className="flex justify-center py-20 text-3xl text-gray-200">⏳</div></Layout>;
  if (error) return (
    <Layout>
      <div className="flex flex-col items-center pt-20 gap-3 text-center p-6">
        <span className="text-5xl">⚠️</span>
        <p className="text-gray-500 text-sm">Failed to load analytics. Please try again.</p>
      </div>
    </Layout>
  );

  // Guard against all-zero values to prevent division by zero in bar chart
  const monthlyPaiseValues = data?.monthly.map((m) => m.paise) ?? [];
  const maxMonthly = monthlyPaiseValues.length > 0 ? Math.max(...monthlyPaiseValues, 1) : 1;

  return (
    <Layout>
      <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3">
        <h1 className="text-xl font-bold text-gray-900">Analytics</h1>
      </div>

      <div className="p-4 flex flex-col gap-4">
        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'You paid', value: data?.totalPaidPaise ?? 0 },
            { label: 'Your share', value: data?.totalSharePaise ?? 0 },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white rounded-2xl p-4 shadow-sm">
              <p className="text-xs text-gray-400 mb-1">{label}</p>
              <p className="text-xl font-bold text-primary">{fmtShort(value)}</p>
            </div>
          ))}
        </div>

        {/* Monthly bar chart */}
        {data?.monthly && data.monthly.length > 0 && (
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <p className="font-semibold text-gray-900 mb-4">Monthly spend</p>
            <div className="flex items-end gap-2 h-28">
              {data.monthly.map(({ month, paise }) => {
                const h = Math.max(4, Math.round((paise / maxMonthly) * 100));
                return (
                  <div key={month} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[10px] text-gray-400">{fmtShort(paise)}</span>
                    <div className="w-full bg-primary rounded-t-md" style={{ height: h }} />
                    <span className="text-[10px] text-gray-400">{fmtMonthDisplay(month).split(' ')[0]}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Category breakdown */}
        {data?.byCategory && data.byCategory.length > 0 && (
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <p className="font-semibold text-gray-900 mb-3">By category</p>
            <div className="flex flex-col gap-3">
              {data.byCategory.map(({ category, paise }) => {
                const pct = Math.round((paise / (data.totalSharePaise || 1)) * 100);
                return (
                  <div key={category} className="flex items-center gap-3">
                    <span className="text-sm w-28 text-gray-700 shrink-0">{CAT_LABELS[category] ?? category}</span>
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-sm font-medium text-gray-900 w-16 text-right shrink-0">{fmtShort(paise)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* By group */}
        {data?.byGroup && data.byGroup.length > 0 && (
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <p className="font-semibold text-gray-900 mb-3">By group</p>
            <div className="flex flex-col gap-2">
              {data.byGroup.map(({ groupId, name, paise }) => (
                <div key={groupId} className="flex items-center justify-between py-1">
                  <span className="text-sm text-gray-700">{name}</span>
                  <span className="text-sm font-semibold text-gray-900">{fmtShort(paise)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {!data?.monthly.length && !loading && (
          <div className="flex flex-col items-center pt-16 gap-3 text-center">
            <span className="text-5xl">📊</span>
            <h3 className="text-xl font-bold text-gray-900">No data yet</h3>
            <p className="text-gray-400 text-sm">Add expenses to your groups to see analytics here.</p>
          </div>
        )}
      </div>
    </Layout>
  );
}
