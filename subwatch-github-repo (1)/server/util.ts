export type BillingCycle = 'weekly' | 'monthly' | 'quarterly' | 'semiannual' | 'yearly';
export type Status = 'active' | 'paused' | 'cancelled';

export const CYCLES: BillingCycle[] = ['weekly', 'monthly', 'quarterly', 'semiannual', 'yearly'];

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

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function parseISO(d: string): Date {
  const [y, m, day] = d.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, day ?? 1));
}

export function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Add `count` billing cycles to an ISO date, clamping the day (Jan 31 + 1mo -> Feb 28). */
export function addCycles(iso: string, cycle: BillingCycle, count = 1): string {
  const base = parseISO(iso);
  // Weekly is day-based, not month-based.
  if (cycle === 'weekly') {
    const d = new Date(base.getTime() + 7 * count * 86_400_000);
    return toISO(d);
  }
  const day = base.getUTCDate();
  const monthsPer = MONTHS_PER_CYCLE[cycle];
  const totalMonths = Math.round(monthsPer * count);
  const target = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + totalMonths, 1));
  const daysInTarget = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)
  ).getUTCDate();
  target.setUTCDate(Math.min(day, daysInTarget));
  return toISO(target);
}

export function daysBetween(fromISO: string, toISODate: string): number {
  const a = parseISO(fromISO).getTime();
  const b = parseISO(toISODate).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** Roll a past renewal date forward until it is today or later. */
export function rollForward(iso: string, cycle: BillingCycle): string {
  const today = todayISO();
  let next = iso.slice(0, 10);
  let guard = 0;
  while (next < today && guard < 600) {
    next = addCycles(next, cycle, 1);
    guard += 1;
  }
  return next;
}

export function monthlyCost(cost: number, cycle: BillingCycle): number {
  return cost / MONTHS_PER_CYCLE[cycle];
}

export function yearlyCost(cost: number, cycle: BillingCycle): number {
  return monthlyCost(cost, cycle) * 12;
}

/** Round to 2 decimals without float dust. */
export function r2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function money(amount: number, currency = 'USD'): string {
  const symbol = CURRENCY_SYMBOL[currency] ?? '';
  const rounded = r2(amount);
  const hasCents = Math.abs(rounded % 1) > 0.001;
  return `${symbol}${rounded.toLocaleString('en-US', {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

export const CATEGORIES = [
  'Entertainment',
  'Music',
  'Software',
  'Cloud & Hosting',
  'AI Tools',
  'Fitness & Health',
  'News & Reading',
  'Gaming',
  'Education',
  'Productivity',
  'Shopping & Delivery',
  'Other',
];

export function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
}
