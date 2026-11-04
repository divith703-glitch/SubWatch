import { db } from './db.js';
import {
  daysBetween,
  monthlyCost,
  r2,
  rollForward,
  todayISO,
  yearlyCost,
  type BillingCycle,
} from './util.js';

export type SubRow = {
  id: number;
  user_id: number;
  name: string;
  category: string;
  cost: number;
  currency: string;
  billing_cycle: BillingCycle;
  next_renewal_date: string;
  started_on: string | null;
  status: 'active' | 'paused' | 'cancelled';
  payment_method: string | null;
  cancel_url: string | null;
  cancel_instructions: string | null;
  notes: string | null;
  reminder_days: number;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PriceChangeRow = {
  id: number;
  subscription_id: number;
  old_cost: number;
  new_cost: number;
  currency: string;
  billing_cycle: BillingCycle;
  source: string;
  note: string | null;
  changed_at: string;
};

/**
 * Pure projection: where does the next renewal actually fall today?
 * Reads never write to the database — the stored date is only advanced by the
 * scheduled sweep in `rollForwardRenewals`, so data changes stay predictable
 * and auditable.
 */
export function projectRenewal(storedDate: string, cycle: BillingCycle, status: string): string {
  const stored = storedDate.slice(0, 10);
  if (status !== 'active') return stored;
  return stored >= todayISO() ? stored : rollForward(stored, cycle);
}

/**
 * Scheduled job (hourly, and on boot): persist rolled-forward renewal dates.
 * Returns the number of rows it moved so the caller can log it.
 */
export function rollForwardRenewals(userId?: number): number {
  const rows = userId
    ? (db
        .prepare(`SELECT * FROM subscriptions WHERE user_id = ? AND status = 'active'`)
        .all(userId) as SubRow[])
    : (db.prepare(`SELECT * FROM subscriptions WHERE status = 'active'`).all() as SubRow[]);

  const update = db.prepare('UPDATE subscriptions SET next_renewal_date = ? WHERE id = ?');
  const today = todayISO();
  let moved = 0;

  const sweep = db.transaction(() => {
    for (const row of rows) {
      if (row.next_renewal_date.slice(0, 10) >= today) continue;
      const next = rollForward(row.next_renewal_date, row.billing_cycle);
      update.run(next, row.id);
      row.next_renewal_date = next;
      moved += 1;
    }
  });
  sweep();
  return moved;
}

export function decorate(row: SubRow) {
  const cycle = row.billing_cycle;
  const projected = projectRenewal(row.next_renewal_date, cycle, row.status);

  const last = db
    .prepare(
      `SELECT * FROM price_changes WHERE subscription_id = ? ORDER BY changed_at DESC, id DESC LIMIT 1`
    )
    .get(row.id) as PriceChangeRow | undefined;

  // First recorded price = the baseline we show as "was".
  const first = db
    .prepare(
      `SELECT * FROM price_changes WHERE subscription_id = ? ORDER BY changed_at ASC, id ASC LIMIT 1`
    )
    .get(row.id) as PriceChangeRow | undefined;

  const daysUntil = daysBetween(todayISO(), projected);

  return {
    id: row.id,
    name: row.name,
    category: row.category,
    cost: r2(row.cost),
    currency: row.currency,
    billing_cycle: cycle,
    next_renewal_date: projected,
    started_on: row.started_on ? row.started_on.slice(0, 10) : null,
    status: row.status,
    payment_method: row.payment_method,
    cancel_url: row.cancel_url,
    cancel_instructions: row.cancel_instructions,
    notes: row.notes,
    reminder_days: row.reminder_days,
    cancelled_at: row.cancelled_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    monthly_cost: r2(monthlyCost(row.cost, cycle)),
    yearly_cost: r2(yearlyCost(row.cost, cycle)),
    days_until_renewal: daysUntil,
    renewal_label: renewalLabel(daysUntil, row.status),
    last_price_change: last
      ? {
          old_cost: r2(last.old_cost),
          new_cost: r2(last.new_cost),
          delta: r2(last.new_cost - last.old_cost),
          delta_pct: last.old_cost
            ? r2(((last.new_cost - last.old_cost) / last.old_cost) * 100)
            : 0,
          changed_at: last.changed_at.slice(0, 10),
          source: last.source,
        }
      : null,
    original_cost: first ? r2(first.old_cost) : r2(row.cost),
  };
}

function renewalLabel(days: number, status: string): string {
  if (status === 'cancelled') return 'Cancelled';
  if (status === 'paused') return 'Paused';
  if (days < 0) return 'Overdue';
  if (days === 0) return 'Renews today';
  if (days === 1) return 'Renews tomorrow';
  if (days <= 45) return `Renews in ${days} days`;
  return `Renews in ${Math.round(days / 30)} months`;
}

export function getSubscriptions(userId: number) {
  const rows = db
    .prepare('SELECT * FROM subscriptions WHERE user_id = ? ORDER BY name COLLATE NOCASE')
    .all(userId) as SubRow[];
  return rows.map(decorate);
}

export function recordPriceChange(opts: {
  subscriptionId: number;
  oldCost: number;
  newCost: number;
  currency: string;
  billingCycle: BillingCycle;
  source: string;
  note?: string | null;
  changedAt?: string;
}) {
  db.prepare(
    `INSERT INTO price_changes (subscription_id, old_cost, new_cost, currency, billing_cycle, source, note, changed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    opts.subscriptionId,
    opts.oldCost,
    opts.newCost,
    opts.currency,
    opts.billingCycle,
    opts.source,
    opts.note ?? null,
    opts.changedAt ?? new Date().toISOString()
  );
}

/**
 * Analytics.
 *
 * Money is never summed across currencies: totals are computed per currency and
 * the primary currency (the account's, or the one it uses most) drives the
 * headline figures. `mixed_currencies` lets the UI warn instead of quietly
 * displaying a misleading total.
 */
export function analytics(userId: number, accountCurrency = 'USD') {
  const subs = getSubscriptions(userId);
  const active = subs.filter((s) => s.status === 'active');
  const paused = subs.filter((s) => s.status === 'paused');
  const cancelled = subs.filter((s) => s.status === 'cancelled');

  const byCurrencyMap = new Map<string, { monthly: number; yearly: number; count: number }>();
  for (const s of active) {
    const entry = byCurrencyMap.get(s.currency) ?? { monthly: 0, yearly: 0, count: 0 };
    entry.monthly = r2(entry.monthly + s.monthly_cost);
    entry.yearly = r2(entry.yearly + s.yearly_cost);
    entry.count += 1;
    byCurrencyMap.set(s.currency, entry);
  }
  const byCurrency = [...byCurrencyMap.entries()]
    .map(([currency, v]) => ({ currency, ...v }))
    .sort((a, b) => b.count - a.count);

  const primary =
    byCurrency.find((c) => c.currency === accountCurrency)?.currency ??
    byCurrency[0]?.currency ??
    accountCurrency;

  const inPrimary = active.filter((s) => s.currency === primary);

  const monthlyTotal = r2(inPrimary.reduce((a, s) => a + s.monthly_cost, 0));
  const yearlyTotal = r2(monthlyTotal * 12);
  const perDay = r2(monthlyTotal / 30.44);

  const byCategory = Object.values(
    inPrimary.reduce<Record<string, { category: string; monthly: number; yearly: number; count: number }>>(
      (acc, s) => {
        acc[s.category] ??= { category: s.category, monthly: 0, yearly: 0, count: 0 };
        acc[s.category].monthly = r2(acc[s.category].monthly + s.monthly_cost);
        acc[s.category].yearly = r2(acc[s.category].yearly + s.yearly_cost);
        acc[s.category].count += 1;
        return acc;
      },
      {}
    )
  ).sort((a, b) => b.monthly - a.monthly);

  const upcoming = active
    .filter((s) => s.days_until_renewal >= 0 && s.days_until_renewal <= 45)
    .sort((a, b) => a.days_until_renewal - b.days_until_renewal)
    .map((s) => ({
      id: s.id,
      name: s.name,
      category: s.category,
      cost: s.cost,
      currency: s.currency,
      billing_cycle: s.billing_cycle,
      date: s.next_renewal_date,
      days_until: s.days_until_renewal,
      renews_soon: s.days_until_renewal <= s.reminder_days,
    }));

  const dueIn = (days: number) =>
    r2(
      inPrimary
        .filter((s) => s.days_until_renewal >= 0 && s.days_until_renewal <= days)
        .reduce((a, s) => a + s.cost, 0)
    );

  const alerts = active
    .filter((s) => s.days_until_renewal >= 0 && s.days_until_renewal <= s.reminder_days)
    .sort((a, b) => a.days_until_renewal - b.days_until_renewal);

  const since = new Date(Date.now() - 1000 * 60 * 60 * 24 * 365).toISOString();
  const changes = db
    .prepare(
      `SELECT pc.*, s.name, s.category FROM price_changes pc
       JOIN subscriptions s ON s.id = pc.subscription_id
       WHERE s.user_id = ? AND pc.changed_at >= ?
       ORDER BY pc.changed_at DESC, pc.id DESC`
    )
    .all(userId, since) as (PriceChangeRow & { name: string; category: string })[];

  const increases = changes.filter((c) => c.new_cost > c.old_cost);
  const annualImpact = r2(
    increases.reduce(
      (a, c) => a + (c.new_cost - c.old_cost) * (12 / (cycleMonths(c.billing_cycle) || 1)),
      0
    )
  );

  // Reconstruct monthly spend for the last 6 months from recorded price changes.
  const trend: { month: string; label: string; total: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - i);
    const monthEnd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))
      .toISOString()
      .slice(0, 10);
    const month = monthEnd.slice(0, 7);
    let total = 0;

    for (const s of subs) {
      if (s.currency !== primary) continue;
      // Paused plans are not being charged, so they never appear in the trend.
      if (s.status === 'paused') continue;
      if (s.started_on && s.started_on > monthEnd) continue;
      if (s.status === 'cancelled') {
        const cancelledMonth = (s.cancelled_at ?? s.updated_at).slice(0, 7);
        if (cancelledMonth <= month) continue; // it was already gone by this month
      }
      // Walk back through this subscription's changes to find the price it
      // carried at the end of the month in question.
      let cost = s.cost;
      for (const c of changes) {
        if (c.subscription_id === s.id && c.changed_at.slice(0, 10) > monthEnd) cost = c.old_cost;
      }
      total += monthlyCost(cost, s.billing_cycle);
    }

    trend.push({
      month,
      label: d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }),
      total: r2(total),
    });
  }

  const savings = r2(
    cancelled.filter((s) => s.currency === primary).reduce((a, s) => a + s.yearly_cost, 0)
  );
  const pausedSavings = r2(
    paused.filter((s) => s.currency === primary).reduce((a, s) => a + s.yearly_cost, 0)
  );

  return {
    totals: {
      monthly: monthlyTotal,
      yearly: yearlyTotal,
      per_day: perDay,
      active_count: active.length,
      paused_count: paused.length,
      cancelled_count: cancelled.length,
      due_next_7: dueIn(7),
      due_next_30: dueIn(30),
      currency: primary,
    },
    by_currency: byCurrency,
    mixed_currencies: byCurrency.length > 1,
    by_category: byCategory,
    upcoming,
    alerts: alerts.map((s) => ({
      id: s.id,
      name: s.name,
      cost: s.cost,
      currency: s.currency,
      billing_cycle: s.billing_cycle,
      date: s.next_renewal_date,
      days_until: s.days_until_renewal,
      reminder_days: s.reminder_days,
      cancel_url: s.cancel_url,
    })),
    price_changes: changes.slice(0, 25).map((c) => ({
      id: c.id,
      subscription_id: c.subscription_id,
      name: c.name,
      category: c.category,
      old_cost: r2(c.old_cost),
      new_cost: r2(c.new_cost),
      delta: r2(c.new_cost - c.old_cost),
      delta_pct: c.old_cost ? r2(((c.new_cost - c.old_cost) / c.old_cost) * 100) : 0,
      currency: c.currency,
      billing_cycle: c.billing_cycle,
      source: c.source,
      note: c.note,
      changed_at: c.changed_at.slice(0, 10),
    })),
    price_impact: {
      increase_count: increases.length,
      annual_impact: annualImpact,
      monthly_impact: r2(annualImpact / 12),
    },
    trend,
    savings: { cancelled_yearly: savings, paused_yearly: pausedSavings },
    most_expensive: inPrimary
      .slice()
      .sort((a, b) => b.yearly_cost - a.yearly_cost)
      .slice(0, 5)
      .map((s) => ({
        id: s.id,
        name: s.name,
        yearly_cost: s.yearly_cost,
        monthly_cost: s.monthly_cost,
        currency: s.currency,
      })),
  };
}

function cycleMonths(cycle: BillingCycle): number {
  return { weekly: 12 / 52, monthly: 1, quarterly: 3, semiannual: 6, yearly: 12 }[cycle];
}
