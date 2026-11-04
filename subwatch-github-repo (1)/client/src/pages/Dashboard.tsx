import type { Subscription, Summary } from '../lib/types';
import KpiCard from '../components/KpiCard';
import { Donut, TrendBars } from '../components/charts';
import { EmptyState, Panel, PanelHeader, SkeletonCard } from '../components/ui';
import {
  IconAlert,
  IconArrowDown,
  IconArrowUp,
  IconBell,
  IconCalendar,
  IconRefresh,
  IconStack,
  IconWallet,
} from '../components/icons';
import { categoryColor, compactMoney, dateLabel, money, relativeDays } from '../lib/format';

export default function Dashboard({
  summary,
  loading,
  onOpenSub,
  onSync,
  onAdd,
  onSeed,
  syncing,
  onGoSubscriptions,
  greetingName,
  syncAvailable = true,
}: {
  summary: Summary | null;
  loading: boolean;
  onOpenSub: (id: number) => void;
  onSync: () => void;
  onAdd: () => void;
  onSeed: () => void;
  syncing: boolean;
  onGoSubscriptions: () => void;
  greetingName: string;
  syncAvailable?: boolean;
}) {
  if (loading || !summary) {
    return (
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="panel h-80 lg:col-span-2" />
          <div className="panel h-80" />
        </div>
      </div>
    );
  }

  const { totals, by_category, upcoming, alerts, price_changes, price_impact, trend, savings, most_expensive } =
    summary;
  const currency = totals.currency;
  const isEmpty = totals.active_count + totals.paused_count + totals.cancelled_count === 0;
  const topCategories = by_category.slice(0, 5);
  const otherMonthly = by_category.slice(5).reduce((a, c) => a + c.monthly, 0);
  const donutData = [
    ...topCategories.map((c) => ({ label: c.category, value: c.monthly, color: categoryColor(c.category) })),
    ...(otherMonthly > 0.01
      ? [{ label: 'Other', value: otherMonthly, color: '#475569' }]
      : []),
  ];

  const increases = price_changes.filter((c) => c.delta > 0.001);
  const realChanges = price_changes.filter((c) => Math.abs(c.delta) > 0.001);

  if (isEmpty) {
    return (
      <Panel>
        <EmptyState
          icon={<IconStack />}
          title="No subscriptions tracked yet"
          body="Add your first subscription — or load a demo portfolio to see how price-increase detection and renewal reminders work."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <button className="btn-primary" onClick={onAdd}>
                Add a subscription
              </button>
              <button className="btn-ghost" onClick={onSeed} disabled={syncing}>
                <IconRefresh width={15} height={15} /> Load demo data
              </button>
            </div>
          }
        />
      </Panel>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Renewal alert strip */}
      {alerts.length > 0 && (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber/25 bg-gradient-to-r from-amber/[0.12] to-transparent px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-amber/30 bg-amber/15 text-amber">
              <IconBell width={16} height={16} />
            </span>
            <div>
              <div className="text-[13.5px] font-medium text-amber">
                {alerts.length === 1
                  ? `${alerts[0].name} renews ${relativeDays(alerts[0].days_until)}`
                  : `${alerts.length} renewals need your attention`}
              </div>
              <div className="text-[12.5px] text-slate-400">
                {money(alerts.reduce((a, s) => a + s.cost, 0), currency)} will be charged in the next
                few days.{' '}
                <button onClick={onGoSubscriptions} className="text-amber underline decoration-amber/40 hover:text-white">
                  Review them
                </button>
              </div>
            </div>
          </div>
          <button
            className="btn-ghost shrink-0 !py-1.5 text-[12.5px]"
            onClick={onSync}
            disabled={syncing || !syncAvailable}
            title={
              syncAvailable
                ? 'Runs the simulated provider feed — not connected to real billing data'
                : 'Provider price sync is not configured on this deployment'
            }
          >
            <IconRefresh width={13} height={13} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Checking…' : syncAvailable ? 'Check price changes (simulated)' : 'Sync unavailable'}
          </button>
        </div>
      )}

      {summary.mixed_currencies && (
        <div className="flex items-start gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-[12.5px] text-slate-400">
          <IconAlert width={15} height={15} className="mt-0.5 shrink-0 text-amber" />
          <span>
            You track subscriptions in more than one currency. Totals here are shown in{' '}
            <span className="text-slate-200">{currency}</span> only — other currencies are listed
            separately in Insights and are never converted or added together.
          </span>
        </div>
      )}

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Monthly spend"
          value={money(totals.monthly, currency)}
          icon={<IconWallet width={16} height={16} />}
          tone="accent"
          hint={`${totals.active_count} active subscriptions`}
          footer={
            <div className="flex items-center justify-between text-[11.5px] text-slate-500">
              <span>{money(totals.per_day, currency)} / day</span>
              <span className="tnum">{money(totals.due_next_30, currency)} due in 30d</span>
            </div>
          }
        />
        <KpiCard
          label="Yearly projection"
          value={money(totals.yearly, currency)}
          icon={<IconCalendar width={16} height={16} />}
          hint="If nothing changes in the next 12 months"
          footer={
            <div className="text-[11.5px] text-slate-500">
              Equivalent to <span className="text-slate-300">{money(totals.yearly / 365, currency)}</span> a day
            </div>
          }
        />
        <KpiCard
          label="Due next 7 days"
          value={money(totals.due_next_7, currency)}
          icon={<IconBell width={16} height={16} />}
          tone={totals.due_next_7 > 0 ? 'danger' : 'neutral'}
          hint={`${upcoming.filter((u) => u.days_until <= 7).length} charges scheduled`}
          footer={
            <div className="text-[11.5px] text-slate-500">
              {upcoming[0]
                ? `Next: ${upcoming[0].name} · ${dateLabel(upcoming[0].date)}`
                : 'Nothing scheduled'}
            </div>
          }
        />
        <KpiCard
          label="Price hikes (12 mo)"
          value={increases.length ? `+${money(price_impact.annual_impact, currency)}` : 'None'}
          icon={<IconArrowUp width={16} height={16} />}
          tone={increases.length ? 'danger' : 'success'}
          hint={
            increases.length
              ? `${increases.length} increase${increases.length > 1 ? 's' : ''} · ${money(
                  price_impact.monthly_impact,
                  currency
                )}/mo extra`
              : 'No provider raised your price this year'
          }
          footer={
            <div className="text-[11.5px] text-slate-500">
              {savings.cancelled_yearly > 0
                ? `${money(savings.cancelled_yearly, currency)}/yr saved by cancelling`
                : 'Annualised cost of the hikes'}
            </div>
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Upcoming renewals */}
        <Panel className="lg:col-span-2">
          <PanelHeader
            title="Upcoming renewals"
            subtitle={`Next 45 days · ${money(
              upcoming.reduce((a, u) => a + u.cost, 0),
              currency
            )} in scheduled charges`}
            action={
              <button className="btn-quiet !px-2.5 !py-1 text-[12px]" onClick={onGoSubscriptions}>
                View all
              </button>
            }
          />
          {upcoming.length === 0 ? (
            <EmptyState
              icon={<IconCalendar />}
              title="No renewals in the next 45 days"
              body="Enjoy the quiet month. Anything further out still shows up in your total."
            />
          ) : (
            <ul className="divide-y divide-white/[0.05]">
              {upcoming.slice(0, 6).map((u) => {
                const urgent = u.days_until <= 3;
                return (
                  <li key={u.id}>
                    <button
                      onClick={() => onOpenSub(u.id)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.03] sm:px-5"
                    >
                      <div
                        className={`flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl border text-center ${
                          urgent
                            ? 'border-rose/30 bg-rose/10 text-rose'
                            : 'border-white/10 bg-white/[0.04] text-slate-300'
                        }`}
                      >
                        <span className="tnum text-[15px] font-semibold leading-none">
                          {u.date.slice(8, 10)}
                        </span>
                        <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-wider opacity-70">
                          {dateLabel(u.date).split(' ')[1]}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-[13.5px] font-medium text-slate-100">
                            {u.name}
                          </span>
                          {u.renews_soon && (
                            <span className="hidden rounded-full bg-amber/15 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider text-amber sm:inline">
                              reminder
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 truncate text-[11.5px] text-slate-500">
                          {u.category} · {relativeDays(u.days_until)}
                        </div>
                      </div>
                      <div
                        className="hidden h-1.5 w-1.5 shrink-0 rounded-full sm:block"
                        style={{ background: categoryColor(u.category) }}
                      />
                      <div className="shrink-0 text-right">
                        <div className="tnum text-[13.5px] font-semibold text-white">
                          {money(u.cost, u.currency)}
                        </div>
                        <div className="text-[10.5px] uppercase tracking-wider text-slate-500">
                          {u.billing_cycle}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        {/* Category split */}
        <Panel>
          <PanelHeader title="Where it goes" subtitle="Active subscriptions only" />
          <div className="flex flex-col items-center gap-5 p-5 sm:flex-row lg:flex-col">
            <Donut
              data={donutData}
              centerValue={money(totals.monthly, currency)}
              centerLabel="per month"
              size={158}
            />
            <ul className="w-full space-y-2.5">
              {by_category.slice(0, 4).map((c) => (
                <li key={c.category} className="flex items-center gap-2.5 text-[12.5px]">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: categoryColor(c.category) }}
                  />
                  <span className="flex-1 truncate text-slate-300">{c.category}</span>
                  <span className="tnum text-slate-500">{money(c.monthly, currency)}</span>
                  <span className="tnum w-9 text-right text-[11px] text-slate-600">
                    {Math.round((c.monthly / Math.max(totals.monthly, 0.01)) * 100)}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Panel>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-3">
        {/* Price change watch */}
        <Panel className="lg:col-span-2">
          <PanelHeader
            title="Price change watch"
            subtitle="Every cost change we've recorded, newest first"
            action={
              <button
                className="btn-ghost !px-2.5 !py-1.5 text-[11.5px]"
                onClick={onSync}
                disabled={syncing || !syncAvailable}
                title="Simulated provider feed — not connected to real billing data"
              >
                <IconRefresh width={13} height={13} className={syncing ? 'animate-spin' : ''} />
                {syncing ? 'Scanning…' : 'Scan providers (demo)'}
              </button>
            }
          />
          {realChanges.length === 0 ? (
            <EmptyState
              icon={<IconArrowUp />}
              title="No price history yet"
              body="Edit a subscription's cost, or run a provider scan, and every change gets logged here with the annual impact."
            />
          ) : (
            <ul className="divide-y divide-white/[0.05]">
              {realChanges.slice(0, 6).map((c) => {
                const up = c.delta > 0.001;
                const flat = Math.abs(c.delta) <= 0.001;
                return (
                  <li key={c.id}>
                    <button
                      onClick={() => onOpenSub(c.subscription_id)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.03] sm:px-5"
                    >
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${
                          flat
                            ? 'border-white/10 bg-white/[0.04] text-slate-500'
                            : up
                              ? 'border-rose/30 bg-rose/10 text-rose'
                              : 'border-mint/30 bg-mint/10 text-mint'
                        }`}
                      >
                        {flat ? (
                          <IconRefresh width={14} height={14} />
                        ) : up ? (
                          <IconArrowUp width={14} height={14} />
                        ) : (
                          <IconArrowDown width={14} height={14} />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-medium text-slate-100">{c.name}</div>
                        <div className="truncate text-[11.5px] text-slate-500">
                          {flat
                            ? 'Baseline recorded'
                            : `${money(c.old_cost, c.currency)} → ${money(c.new_cost, c.currency)}`}
                          {c.note ? ` · ${c.note}` : ''}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div
                          className={`tnum text-[13px] font-semibold ${
                            flat ? 'text-slate-500' : up ? 'text-rose' : 'text-mint'
                          }`}
                        >
                          {flat ? '—' : `${up ? '+' : ''}${c.delta_pct.toFixed(1)}%`}
                        </div>
                        <div className="text-[10.5px] text-slate-600">{dateLabel(c.changed_at)}</div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        {/* Trend + most expensive */}
        <div className="space-y-4">
          <Panel>
            <PanelHeader title="Spend trend" subtitle="Reconstructed from recorded prices" />
            <div className="p-5">
              <TrendBars data={trend} format={(n) => money(n, currency)} />
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Biggest yearly costs" />
            <ul className="divide-y divide-white/[0.05]">
              {most_expensive.map((s: { id: number; name: string; yearly_cost: number; currency: string }) => (
                <li key={s.id}>
                  <button
                    onClick={() => onOpenSub(s.id)}
                    className="flex w-full items-center justify-between gap-3 px-5 py-2.5 text-left hover:bg-white/[0.03]"
                  >
                    <span className="truncate text-[12.5px] text-slate-300">{s.name}</span>
                    <span className="tnum shrink-0 text-[12.5px] font-medium text-white">
                      {compactMoney(s.yearly_cost, s.currency)}
                      <span className="text-[10px] font-normal text-slate-500">/yr</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>

      <p className="px-1 text-[11.5px] leading-relaxed text-slate-600">
        Tip, {greetingName}: open any subscription to see its full price history and the exact steps
        to cancel it.
      </p>
    </div>
  );
}
