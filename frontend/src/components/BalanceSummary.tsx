
import { useState } from 'react';
import { Avatar } from './ui/Avatar';
import { fmtShort } from '@/utils/format';
import type { NetBalance, Settlement } from '@/types';

interface Props {
  settlements: Settlement[];
  netBalances: NetBalance[];
  myPhone: string;
  onSettle?: (s: Settlement) => Promise<void>;
}

export function BalanceSummary({ settlements, netBalances, myPhone, onSettle }: Props) {
  const [settling, setSettling] = useState<number | null>(null);

  const hasActivity = netBalances.some((b) => b.netPaise !== 0);

  async function doSettle(s: Settlement, i: number) {
    setSettling(i);
    try { await onSettle?.(s); }
    finally { setSettling(null); }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Per-member net balances */}
      {hasActivity && (
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Each member's balance
          </p>
          <div className="flex flex-col gap-1">
            {netBalances.map((b) => {
              const isMe = b.phone === myPhone;
              const label = isMe ? 'You' : b.name;
              const positive = b.netPaise > 0;
              const zero = b.netPaise === 0;
              return (
                <div key={b.phone} className={`flex items-center gap-3 px-3 py-2 rounded-xl ${isMe ? 'bg-gray-50' : ''}`}>
                  <Avatar name={b.name} size={30} />
                  <span className={`flex-1 text-sm font-medium ${isMe ? 'text-gray-900' : 'text-gray-700'}`}>
                    {label}
                  </span>
                  <span className={`text-sm font-bold ${zero ? 'text-gray-400' : positive ? 'text-green-600' : 'text-red-500'}`}>
                    {zero ? '–' : positive ? `+${fmtShort(b.netPaise)}` : `-${fmtShort(Math.abs(b.netPaise))}`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Settlements */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
          Suggested settlements
        </p>
        {settlements.length === 0 ? (
          <div className="flex flex-col items-center py-6 gap-2 text-gray-400">
            <span className="text-3xl">✓</span>
            <span className="font-medium text-sm">All settled up</span>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {settlements.map((s, i) => {
              const isMe = s.fromPhone === myPhone || s.toPhone === myPhone;
              const fromLabel = s.fromPhone === myPhone ? 'You' : s.fromName;
              const toLabel = s.toPhone === myPhone ? 'you' : s.toName;
              const amtColor = s.fromPhone === myPhone ? 'text-red-500' : 'text-green-600';
              const canSettle = onSettle && s.fromPhone === myPhone;
              const isSettling = settling === i;
              return (
                <div key={i} className={`flex items-center gap-3 p-3 rounded-xl ${isMe ? 'bg-gray-50' : ''}`}>
                  <Avatar name={s.fromName} size={32} />
                  <p className="flex-1 text-sm text-gray-600">
                    <span className="font-semibold text-gray-900">{fromLabel}</span> owes{' '}
                    <span className="font-semibold text-gray-900">{toLabel}</span>
                  </p>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`font-bold text-sm ${amtColor}`}>{fmtShort(s.amountPaise)}</span>
                    {canSettle && (
                      <button
                        onClick={() => doSettle(s, i)}
                        disabled={isSettling}
                        className="text-xs font-semibold text-white bg-primary px-3 py-1 rounded-full hover:bg-primary-dark transition-colors disabled:opacity-50">
                        {isSettling ? '…' : 'Settle'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
