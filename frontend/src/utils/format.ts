export const fmt = (paise: number) =>
  `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const fmtShort = (paise: number) => {
  const r = paise / 100;
  return `₹${r % 1 === 0 ? r.toLocaleString('en-IN') : r.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const rupeesToPaise = (r: number) => Math.round(r * 100);
export const paiseToRupees = (p: number) => p / 100;

export const fmtDate = (ms: number) =>
  new Date(ms).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

export const fmtDateShort = (ms: number) =>
  new Date(ms).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });

export const fmtMonth = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export const fmtMonthDisplay = (yyyyMm: string) => {
  const [y, m] = yyyyMm.split('-');
  return new Date(Number(y), Number(m) - 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
};

export const initials = (name: string) =>
  name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
