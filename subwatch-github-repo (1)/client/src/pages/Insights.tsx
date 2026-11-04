import type { Summary } from '../lib/types';
import { Donut, Meter, TrendBars } from '../components/charts';
import { EmptyState, Panel, PanelHeader } from '../components/ui';
import { IconAlert, IconArrowDown, IconArrowUp, IconChart, IconShield } from '../components/icons';
import { categoryColor, dateLabel, money } from '../lib/format';

export default function Insights({
  summary,
  onOpenSub,
}: {
  summary: Summary | null;
  onOpenSub: (id: number) => void;
}) {
  if (!summary) return <Panel className="h-96" />;

  const { totals, by_category, price_changes, price_impact, trend, savings, most_expensive } = summary;
  const currency = totals.currency;
  const increases = price_changes.filter((c) => c.delta > 0.001);
  const decreases = price_changes.filter((c) => c.delta < -0.001);
  const maxCategory = Math.max(...by_category.map((c) => c.monthly), 1);
  const avgPerSub = totals.active_count ? totals.monthly / totals.active_count : 0;

  const biggestHike = increases.reduce<null | (typeof increases)[number]>(
    (best, c) => (!best || c.delta_pct > best.delta_pct ? c : best),
    null
  );

  const donutData = by_category.map((c) => ({
    label: c.category,
    value: c.monthly,
    color: categoryColor(c.category),
  }));

  const stats = [
    { label: 'Yearly committed', value: money(totals.yearly, currency), hint: 'across active plans' },
    { label: 'Average per plan', value: money(avgPerSub, currency), hint: 'per month' },
    {
      label: 'Cost of hikes',
      value: increases.length ? `+${money(price_impact.annual_impact, currency)}` : '—',
      hint: 'per year, after increases',
    },
    {
      label: 'Saved by cancelling',
      value: money(savings.cancelled_yearly, currency),
      hint: 'per year',
    },
  ];

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="panel p-4 sm:p-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.13em] text-slate-500">
              {s.label}
            </div>
            <div className="kpi-value mt-2.5">{s.value}</div>
            <div className="mt-1.5 text-[11.5px] text-slate-500">{s.hint}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Panel className="lg:col-span-3">
          <PanelHeader title="Monthly spend trend" subtitle="Rebuilt from every price change on record" />
          <div className="p-5">
            <TrendBars data={trend} format={(n) => money(n, currency)} />
            <div className="mt-4 grid grid-cols-3 gap-3 border-t border-white/[0.06] pt-4 text-[11.5px]">
              <div>
                <div className="text-slate-500">Per day</div>
                <div className="tnum mt-0.5 text-[14px] font-medium text-white">
                  {money(totals.per_day, currency)}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Due in 7 days</div>
                <div className="tnum mt-0.5 text-[14px] font-medium text-white">
                  {money(totals.due_next_7, currency)}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Due in 30 days</div>
                <div className="tnum mt-0.5 text-[14px] font-medium text-white">
                  {money(totals.due_next_30, currency)}
                </div>
              </div>
            </div>
          </div>
        </Panel>

        <Panel className="lg:col-span-2">
          <PanelHeader title="Category mix" subtitle={`${by_category.length} categories in play`} />
          <div className="flex flex-col items-center gap-4 p-5 sm:flex-row lg:flex-row">
            <Donut data={donutData} centerValue={String(totals.active_count)} centerLabel="active" size={132} />
            <ul className="w-full space-y-2">
              {by_category.slice(0, 6).map((c) => (
                <li key={c.category}>
                  <div className="mb-1 flex items-center justify-between gap-2 text-[12px]">
                    <span className="flex items-center gap-1.5 truncate text-slate-300">
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ background: categoryColor(c.category) }}
                      />
                      {c.category}
                    </span>
                    <span className="tnum shrink-0 text-slate-400">{money(c.monthly, currency)}</span>
                  </div>
                  <Meter value={c.monthly} max={maxCategory} color={categoryColor(c.category)} />
                </li>
              ))}
            </ul>
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Panel className="lg:col-span-3">
          <PanelHeader
            title="Price change log"
            subtitle="Every increase and decrease we detected or recorded"
            action={
              <span className="chip">
                {increases.length} up · {decreases.length} down
              </span>
            }
          />
          {price_changes.length === 0 ? (
            <EmptyState
              icon={<IconChart />}
              title="No price changes recorded"
              body="When a provider raises its price, edit the subscription cost or run a provider scan — the difference is logged here."
            />
          ) : (
            <ul className="divide-y divide-white/[0.05]">
              {price_changes.map((c) => {
                const up = c.delta > 0.001;
                const flat = Math.abs(c.delta) <= 0.001;
                return (
                  <li key={c.id}>
                    <button
                      onClick={() => onOpenSub(c.subscription_id)}
                      className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-white/[0.03]"
                    >
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${
                          flat
                            ? 'border-white/10 bg-white/[0.04] text-slate-500'
                            : up
                              ? 'border-rose/25 bg-rose/10 text-rose'
                              : 'border-mint/25 bg-mint/10 text-mint'
                        }`}
                      >
                        {flat ? (
                          <IconShield width={13} height={13} />
                        ) : up ? (
                          <IconArrowUp width={13} height={13} />
                        ) : (
                          <IconArrowDown width={13} height={13} />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[12.5px] font-medium text-slate-200">
                          {c.name}
                          <span className="ml-2 text-[10.5px] font-normal uppercase tracking-wider text-slate-600">
                            {c.source.replace('-', ' ')}
                          </span>
                        </div>
                        <div className="truncate text-[11px] text-slate-500">
                          {flat
                            ? `${money(c.new_cost, c.currency)} baseline · ${c.note ?? 'recorded'}`
                            : `${money(c.old_cost, c.currency)} → ${money(c.new_cost, c.currency)} · ${dateLabel(c.changed_at)}`}
                        </div>
                      </div>
                      {!flat && (
                        <span
                          className={`tnum shrink-0 text-[12.5px] font-semibold ${
                            up ? 'text-rose' : 'text-mint'
                          }`}
                        >
                          {up ? '+' : ''}
                          {c.delta_pct.toFixed(1)}%
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <div className="space-y-4 lg:col-span-2">
          <Panel>
            <PanelHeader title="Biggest hike" />
            <div className="p-5">
              {biggestHike ? (
                <>
                  <div className="text-[13.5px] font-medium text-white">{biggestHike.name}</div>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="tnum text-[26px] font-semibold text-rose">
                      +{biggestHike.delta_pct.toFixed(1)}%
                    </span>
                    <span className="text-[12px] text-slate-500">
                      {money(biggestHike.old_cost, biggestHike.currency)} →{' '}
                      {money(biggestHike.new_cost, biggestHike.currency)}
                    </span>
                  </div>
                  <p className="mt-2 text-[12px] leading-relaxed text-slate-500">
                    {biggestHike.note ?? 'Recorded price change'} ·{' '}
                    {dateLabel(biggestHike.changed_at)}
                  </p>
                  <div className="mt-3 rounded-lg border border-amber/20 bg-amber/[0.07] px-3 py-2 text-[11.5px] leading-relaxed text-amber">
                    <IconAlert width={12} height={12} className="mr-1 inline" />
                    Switching to an annual plan or downgrading a tier often removes this increase
                    entirely.
                  </div>
                </>
              ) : (
                <p className="text-[12.5px] text-slate-500">
                  No increases on record. Your providers have been well behaved.
                </p>
              )}
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Savings & pauses" />
            <div className="space-y-3 p-5 text-[12.5px]">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Cancelled subscriptions</span>
                <span className="tnum font-medium text-mint">
                  {money(savings.cancelled_yearly, currency)}/yr
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Paused (not being charged)</span>
                <span className="tnum font-medium text-amber">
                  {money(savings.paused_yearly, currency)}/yr
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-white/[0.06] pt-3">
                <span className="text-slate-400">Paused + cancelled</span>
                <span className="tnum font-semibold text-white">
                  {money(savings.cancelled_yearly + savings.paused_yearly, currency)}/yr
                </span>
              </div>
              <p className="text-[11.5px] leading-relaxed text-slate-600">
                Cancelling or pausing a plan removes it from your monthly total immediately, which
                then flows through to the yearly projection.
              </p>
            </div>
          </Panel>
        </div>
      </div>

      {summary.mixed_currencies && (
        <Panel>
          <PanelHeader
            title="Totals by currency"
            subtitle="Never summed together — each currency is reported on its own"
          />
          <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
            {summary.by_currency.map((c) => (
              <div key={c.currency} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                    {c.currency}
                  </span>
                  <span className="tnum text-[10.5px] text-slate-600">{c.count} active</span>
                </div>
                <div className="tnum mt-1.5 text-[17px] font-semibold text-white">
                  {money(c.monthly, c.currency)}
                  <span className="text-[10px] font-normal text-slate-500">/mo</span>
                </div>
                <div className="tnum text-[11.5px] text-slate-500">
                  {money(c.yearly, c.currency)}/yr
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <Panel>
        <PanelHeader title="Most expensive plans" subtitle="Ranked by yearly cost" />
        <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-5">
          {most_expensive.map((s, i) => (
            <button
              key={s.id}
              onClick={() => onOpenSub(s.id)}
              className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5 text-left transition-colors hover:border-white/15 hover:bg-white/[0.05]"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10.5px] font-semibold text-slate-600">#{i + 1}</span>
                <span className="tnum text-[10.5px] text-slate-500">
                  {money(s.monthly_cost, s.currency)}/mo
                </span>
              </div>
              <div className="mt-1.5 truncate text-[12.5px] font-medium text-slate-200">{s.name}</div>
              <div className="tnum mt-0.5 text-[15px] font-semibold text-white">
                {money(s.yearly_cost, s.currency)}
                <span className="text-[10px] font-normal text-slate-500">/yr</span>
              </div>
            </button>
          ))}
        </div>
      </Panel>
    </div>
  );
}
