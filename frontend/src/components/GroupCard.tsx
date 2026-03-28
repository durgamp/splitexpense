
import { Avatar } from './ui/Avatar';
import { fmtShort } from '@/utils/format';
import type { Group } from '@/types';

interface Props {
  group: Group;
  myNetPaise: number;
  onClick: () => void;
}

export function GroupCard({ group, myNetPaise, onClick }: Props) {
  const active = group.members.filter((m) => m.status === 'active').length;
  const balanceColor = myNetPaise > 0 ? 'text-green-600' : myNetPaise < 0 ? 'text-red-500' : 'text-gray-400';
  const balanceText = myNetPaise > 0
    ? `Owed ${fmtShort(myNetPaise)}`
    : myNetPaise < 0
    ? `Owe ${fmtShort(Math.abs(myNetPaise))}`
    : 'Settled';

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 bg-white rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow text-left"
    >
      <Avatar name={group.name} size={48} />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-900 truncate">{group.name}</p>
        <p className="text-sm text-gray-400">{active} members</p>
      </div>
      <span className={`text-sm font-semibold shrink-0 ${balanceColor}`}>{balanceText}</span>
    </button>
  );
}
