'use client';

const COLORS = [
  'bg-violet-500', 'bg-indigo-500', 'bg-blue-500', 'bg-teal-500',
  'bg-emerald-500', 'bg-orange-500', 'bg-rose-500', 'bg-pink-500',
];

function colorFor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return COLORS[Math.abs(h) % COLORS.length];
}

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
}

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const style = { width: size, height: size, fontSize: size * 0.38 };
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full text-white font-bold shrink-0 select-none ${colorFor(name)}`}
      style={style}
    >
      {initials(name)}
    </span>
  );
}
