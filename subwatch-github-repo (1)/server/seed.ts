import { db } from './db.js';
import { hashPassword, type UserRow } from './auth.js';
import { findCatalogEntry } from './catalog.js';
import { addCycles, monthlyCost, todayISO, type BillingCycle } from './util.js';

export const DEMO_EMAIL = 'demo@subwatch.app';
export const DEMO_PASSWORD = 'demo1234';

function isoMonthsAgo(months: number, dayOffset = 0): string {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
}

function isoDaysFromNow(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

type SeedSpec = {
  name: string;
  category: string;
  cost: number;
  cycle: BillingCycle;
  renewInDays: number;
  status?: 'active' | 'paused' | 'cancelled';
  startedMonthsAgo?: number;
  payment?: string;
  notes?: string;
  reminderDays?: number;
  increases?: { oldCost: number; monthsAgo: number; note?: string }[];
};

const DEMO_SUBS: SeedSpec[] = [
  {
    name: 'Netflix',
    category: 'Entertainment',
    cost: 22.99,
    cycle: 'monthly',
    renewInDays: 4,
    startedMonthsAgo: 14,
    payment: 'Visa •• 4412',
    notes: 'Standard plan — mostly for weekend binges.',
    increases: [{ oldCost: 19.99, monthsAgo: 2, note: 'Standard plan price increase' }],
  },
  {
    name: 'Spotify Premium',
    category: 'Music',
    cost: 11.99,
    cycle: 'monthly',
    renewInDays: 11,
    startedMonthsAgo: 20,
    payment: 'Visa •• 4412',
    increases: [{ oldCost: 10.99, monthsAgo: 5, note: 'Individual plan price increase' }],
  },
  {
    name: 'YouTube Premium',
    category: 'Entertainment',
    cost: 13.99,
    cycle: 'monthly',
    renewInDays: 1,
    startedMonthsAgo: 9,
    payment: 'Google Play balance',
  },
  {
    name: 'ChatGPT Plus',
    category: 'AI Tools',
    cost: 20,
    cycle: 'monthly',
    renewInDays: 18,
    startedMonthsAgo: 7,
    payment: 'Mastercard •• 8890',
    notes: 'Team subscription — keep this one.',
    reminderDays: 3,
  },
  {
    name: 'Adobe Creative Cloud',
    category: 'Software',
    cost: 34.99,
    cycle: 'monthly',
    renewInDays: 26,
    startedMonthsAgo: 18,
    payment: 'Mastercard •• 8890',
    notes: 'Annual plan billed monthly — early termination fee applies.',
    increases: [{ oldCost: 29.99, monthsAgo: 3, note: 'Renewed at new annual rate' }],
  },
  {
    name: 'Amazon Prime',
    category: 'Shopping & Delivery',
    cost: 139,
    cycle: 'yearly',
    renewInDays: 64,
    startedMonthsAgo: 36,
    payment: 'Amazon ICICI card',
    reminderDays: 14,
    increases: [{ oldCost: 119, monthsAgo: 8, note: 'Annual membership price increase' }],
  },
  { name: 'iCloud+', category: 'Cloud & Hosting', cost: 2.99, cycle: 'monthly', renewInDays: 6, startedMonthsAgo: 30, payment: 'Apple ID balance' },
  { name: 'Notion Plus', category: 'Productivity', cost: 120, cycle: 'yearly', renewInDays: 40, startedMonthsAgo: 12, payment: 'Visa •• 4412' },
  { name: 'GitHub Copilot', category: 'Software', cost: 100, cycle: 'yearly', renewInDays: 88, startedMonthsAgo: 6, payment: 'GitHub billing' },
  { name: 'DigitalOcean', category: 'Cloud & Hosting', cost: 24, cycle: 'monthly', renewInDays: 2, startedMonthsAgo: 15, payment: 'Visa •• 4412', notes: '2 droplets for side projects.' },
  { name: 'Figma Professional', category: 'Software', cost: 15, cycle: 'monthly', renewInDays: 21, startedMonthsAgo: 22, status: 'paused', payment: 'Visa •• 4412', notes: 'Paused while freelancing full-time.' },
  { name: 'Audible', category: 'News & Reading', cost: 14.95, cycle: 'monthly', renewInDays: 33, startedMonthsAgo: 10, status: 'paused', payment: 'Mastercard •• 8890', notes: 'Paused — 6 unused credits.' },
  {
    name: 'Grammarly Premium',
    category: 'Software',
    cost: 144,
    cycle: 'yearly',
    renewInDays: 120,
    startedMonthsAgo: 29,
    status: 'cancelled',
    payment: 'Visa •• 4412',
    notes: 'Cancelled after the free trial — money saved.',
  },
  { name: 'Cult.fit', category: 'Fitness & Health', cost: 24.99, cycle: 'monthly', renewInDays: 9, startedMonthsAgo: 8, payment: 'UPI auto-pay' },
];

function insertSub(userId: number, spec: SeedSpec) {
  const guide = findCatalogEntry(spec.name);
  const now = new Date().toISOString();
  const started = isoMonthsAgo(spec.startedMonthsAgo ?? 6);
  const nextRenewal = spec.status === 'cancelled'
    ? isoMonthsAgo(spec.startedMonthsAgo ?? 6)
    : isoDaysFromNow(spec.renewInDays);

  const info = db
    .prepare(
      `INSERT INTO subscriptions
        (user_id, name, category, cost, currency, billing_cycle, next_renewal_date, started_on, status,
         payment_method, cancel_url, cancel_instructions, notes, reminder_days, cancelled_at, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      userId,
      spec.name,
      spec.category,
      0,
      'USD',
      spec.cycle,
      nextRenewal,
      started,
      spec.status ?? 'active',
      spec.payment ?? null,
      guide?.cancelUrl ?? null,
      guide ? guide.steps.map((s) => `• ${s}`).join('\n') : null,
      spec.notes ?? null,
      spec.reminderDays ?? 7,
      spec.status === 'cancelled' ? isoMonthsAgo(Math.max((spec.startedMonthsAgo ?? 6) - 5, 0)) : null,
      now,
      now
    );
  const id = Number(info.lastInsertRowid);

  const increases = (spec.increases ?? []).slice().sort((a, b) => b.monthsAgo - a.monthsAgo);
  const initialCost = increases.length ? increases[0].oldCost : spec.cost;

  const addChange = db.prepare(
    `INSERT INTO price_changes (subscription_id, old_cost, new_cost, currency, billing_cycle, source, note, changed_at)
     VALUES (?,?,?,?,?,?,?,?)`
  );
  addChange.run(id, initialCost, initialCost, 'USD', spec.cycle, 'created', 'Subscription added', `${started}T09:00:00.000Z`);

  let previous = initialCost;
  for (const inc of increases) {
    addChange.run(id, inc.oldCost, spec.cost, 'USD', spec.cycle, 'provider-sync', inc.note ?? 'Price update', `${isoMonthsAgo(inc.monthsAgo)}T09:00:00.000Z`);
    previous = spec.cost;
  }
  void previous;

  db.prepare('UPDATE subscriptions SET cost = ? WHERE id = ?').run(spec.cost, id);
  return id;
}

/**
 * Creates the demo account (when `createAccount`) and optionally fills an
 * existing account with a realistic portfolio. Idempotent.
 */
export function seedDemoUser(
  userId: number,
  opts: { createAccount?: boolean; onlyIfEmpty?: boolean } = {}
) {
  let targetId = userId;

  if (opts.createAccount) {
    const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(DEMO_EMAIL) as UserRow | undefined;
    if (existing) {
      targetId = existing.id;
    } else {
      const info = db
        .prepare('INSERT INTO users (email, name, password_hash, currency, created_at) VALUES (?,?,?,?,?)')
        .run(DEMO_EMAIL, 'Aarav (demo)', hashPassword(DEMO_PASSWORD), 'USD', new Date().toISOString());
      targetId = Number(info.lastInsertRowid);
    }
  }

  if (!targetId) return;

  if (opts.onlyIfEmpty) {
    const count = db
      .prepare('SELECT COUNT(*) as c FROM subscriptions WHERE user_id = ?')
      .get(targetId) as { c: number };
    if (count.c > 0) return;
  }

  const tx = db.transaction(() => {
    for (const spec of DEMO_SUBS) insertSub(targetId, spec);
  });
  tx();

  const monthly = DEMO_SUBS.filter((s) => (s.status ?? 'active') === 'active').reduce(
    (a, s) => a + monthlyCost(s.cost, s.cycle),
    0
  );
  console.log(`Seeded ${DEMO_SUBS.length} subscriptions — $${monthly.toFixed(2)}/mo`);
  void addCycles;
  void todayISO;
}
