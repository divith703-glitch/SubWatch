import type { BillingCycle } from './types';

export const CURRENCY_SYMBOL: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  INR: '₹',
  CAD: 'CA$',
  AUD: 'A$',
  JPY: '¥',
  BRL: 'R$',
  SGD: 'S$',
  AED: 'AED ',
};

export const CYCLE_SHORT: Record<BillingCycle, string> = {
  weekly: '/wk',
  monthly: '/mo',
  quarterly: '/qtr',
  semiannual: '/6mo',
  yearly: '/yr',
};

export const MONTHS_PER_CYCLE: Record<BillingCycle, number> = {
  weekly: 12 / 52,
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  yearly: 12,
};

export const CYCLE_LABEL: Record<BillingCycle, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  semiannual: 'Every 6 months',
  yearly: 'Yearly',
};

export function money(amount: number, currency = 'USD'): string {
  const symbol = CURRENCY_SYMBOL[currency] ?? `${currency} `;
  const rounded = Math.round((amount + Number.EPSILON) * 100) / 100;
  const hasCents = Math.abs(rounded % 1) > 0.001;
  return `${symbol}${rounded.toLocaleString('en-US', {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

export function compactMoney(amount: number, currency = 'USD'): string {
  if (Math.abs(amount) >= 10_000) {
    return `${CURRENCY_SYMBOL[currency] ?? ''}${(amount / 1000).toFixed(1)}k`;
  }
  return money(amount, currency);
}

/** "28 Nov" / "28 Nov 2027" when the year differs from now. */
export function dateLabel(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString('en-GB', opts);
}

export function longDate(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function relativeDays(days: number): string {
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days}d`;
}

export function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

const PALETTE = [
  '#7C6CFF',
  '#3DDC97',
  '#58C4FF',
  '#FBBF24',
  '#FB7185',
  '#C084FC',
  '#34D399',
  '#F472B6',
  '#38BDF8',
  '#FCD34D',
];

export function categoryColor(category: string): string {
  let hash = 0;
  for (let i = 0; i < category.length; i++) hash = (hash * 31 + category.charCodeAt(i)) % 9973;
  return PALETTE[hash % PALETTE.length];
}

export function todayISO(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function addMonthsISO(iso: string, months: number): string {
  const d = new Date(`${iso}T00:00:00`);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
