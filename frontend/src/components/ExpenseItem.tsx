
import { useState } from 'react';
import { fmtShort, fmtDateShort } from '@/utils/format';
import type { Expense, Group } from '@/types';

const CAT_ICONS: Record<string, string> = {
  food: '🍽️', transport: '🚗', accommodation: '🏠',
  entertainment: '🎬', utilities: '💡', shopping: '🛍️', other: '📌',
};

interface Props {
  expense: Expense;
  group: Group;
  myPhone: string;
  onDelete?: () => void;
}

export function ExpenseItem({ expense, group, myPhone, onDelete }: Props) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const payer = group.members.find((m) => m.phone === expense.paidByPhone);
  const payerName = payer?.phone === myPhone ? 'You' : (payer?.name ?? expense.paidByPhone);
  const myShare = expense.shares.find((s) => s.phone === myPhone);
  const iPaid = expense.paidByPhone === myPhone;

  let shareText = '';
  let shareColor = 'text-gray-400';

  if (myShare) {
    if (iPaid) {
      const othersOwe = expense.amountPaise - myShare.amountPaise;
      if (othersOwe > 0) { shareText = `+${fmtShort(othersOwe)}`; shareColor = 'text-green-600'; }
      else shareText = 'You paid';
    } else {
      shareText = `-${fmtShort(myShare.amountPaise)}`; shareColor = 'text-red-500';
    }
  }

  return (
    <div className="flex items-center gap-3 py-3">
      <span className="text-2xl w-9 text-center">{CAT_ICONS[expense.category] ?? '📌'}</span>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-900 truncate">{expense.description}</p>
        <p className="text-sm text-gray-400">
          {payerName} paid {fmtShort(expense.amountPaise)} · {fmtDateShort(expense.createdAt)}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {shareText && <span className={`text-sm font-semibold ${shareColor}`}>{shareText}</span>}
        {onDelete && (
          confirmDelete ? (
            <div className="flex gap-1">
              <button
                onClick={() => { onDelete(); setConfirmDelete(false); }}
                className="text-xs text-red-500 font-semibold px-2 py-1 rounded-lg bg-red-50 border border-red-200">
                Delete
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-xs text-gray-400 px-2 py-1 rounded-lg bg-gray-100">
                No
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="text-gray-300 hover:text-red-400 transition-colors p-1 text-sm">
              🗑
            </button>
          )
        )}
      </div>
    </div>
  );
}
