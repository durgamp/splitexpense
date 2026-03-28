
import { initials } from '@/utils/format';

const COLORS = ['#6366F1','#8B5CF6','#EC4899','#EF4444','#F97316','#EAB308','#22C55E','#14B8A6','#3B82F6','#0EA5E9'];

function colorFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) { h = (h << 5) - h + name.charCodeAt(i); h |= 0; }
  return COLORS[Math.abs(h) % COLORS.length];
}

interface AvatarProps {
  name: string;
  size?: number;
  className?: string;
}

export function Avatar({ name, size = 40, className = '' }: AvatarProps) {
  const bg = colorFor(name);
  const fontSize = Math.round(size * 0.38);
  return (
    <div
      className={`flex items-center justify-center rounded-full shrink-0 font-bold text-white ${className}`}
      style={{ width: size, height: size, backgroundColor: bg, fontSize }}
    >
      {initials(name)}
    </div>
  );
}
