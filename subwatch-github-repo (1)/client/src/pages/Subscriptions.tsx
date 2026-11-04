import { useMemo, useState } from 'react';
import type { Subscription, SubStatus, Summary } from '../lib/types';
import { EmptyState, Panel } from '../components/ui';
import {
  IconArrowUp,
  IconCalendar,
  IconExternal,
  IconPencil,
  IconPlus,
  IconSearch,
  IconStack,
} from '../components/icons';
import { CYCLE_SHORT, categoryColor, dateLabel, money, relativeDays } from '../lib/format';

type Filter = 'all' | SubStatus;
type Sort = 'renewal' | 'cost' | 'name' | 'added';

export default function Subscriptions({
  subscriptions,
  summary,
  onOpen,
  onEdit,
  onAdd,
  onExport,
}: {
  subscriptions: Subscription[];
  summary: Summary | null;
  onOpen: (id: number) => void;
  onEdit: (s: Subscription) => void;
  onAdd: () => void;
  onExport: () => void;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('renewal');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = subscriptions.filter((s) => {
      if (filter !== 'all' && s.status !== filter) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q) ||
        (s.payment_method ?? '').toLowerCase().includes(q)
      );
    });
    return list.sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'cost') return b.yearly_cost - a.yearly_cost;
      if (sort === 'added') return b.created_at.localeCompare(a.created_at);
      return a.days_until_renewal - b.days_until_renewal;
    });
  }, [subscriptions, filter, sort, query]);

  const counts = {
    all: subscriptions.length,
    active: subscriptions.filter((s) => s.status === 'active').length,
    paused: subscriptions.filter((s) => s.status === 'paused').length,
    cancelled: subscriptions.filter((s) => s.status === 'cancelled').length,
  };

  const filteredMonthly = filtered
    .filter((s) => s.status === 'active')
    .reduce((a, s) => a + s.monthly_cost, 0);

  return (
    <div className="space-y-4">
      <Panel className="overflow-hidden">
        {/* Toolbar */}
        <div className="flex flex-col gap-3 border-b border-white/[0.06] p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 flex-col gap-2.5 sm:flex-row sm:items-center">
            <div className="relative flex-1 sm:max-w-[300px]">
              <IconSearch
                width={15}
                height={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
              />
              <input
                className="field !py-2 pl-9 text-[13px]"
                placeholder="Search subscriptions…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="flex gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
              {(['all', 'active', 'paused', 'cancelled'] as Filter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`rounded-lg px-2.5 py-1.5 text-[12px] font-medium capitalize transition-colors ${
                    filter === f ? 'bg-white/[0.1] text-white' : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {f} <span className="tnum ml-0.5 text-[10.5px] opacity-60">{counts[f]}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              className="field !w-auto !py-2 text-[12.5px]"
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              aria-label="Sort"
            >
              <option value="renewal">Renewal date</option>
              <option value="cost">Yearly cost</option>
              <option value="name">Name</option>
              <option value="added">Recently added</option>
            </select>
            <button className="btn-ghost !py-2 text-[12.5px]" onClick={onExport}>
              <IconExternal width={13} height={13} /> CSV
            </button>
            <button className="btn-primary !py-2 text-[12.5px]" onClick={onAdd}>
              <IconPlus width={14} height={14} /> Add
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-4 py-2.5 text-[11.5px] text-slate-500">
          <span>
            Showing <span className="text-slate-300">{filtered.length}</span> of{' '}
            {subscriptions.length}
          </span>
          <span>
            Active spend:{' '}
            <span className="tnum text-slate-300">{money(filteredMonthly, summary?.totals.currency)}/mo</span>
          </span>
          <span className="hidden sm:inline">
            {money(filteredMonthly * 12, summary?.totals.currency)}/yr
          </span>
        </div>

        {/* Table */}
        {filtered.length === 0 ? (
          <EmptyState
            icon={<IconStack />}
            title={subscriptions.length === 0 ? 'No subscriptions yet' : 'Nothing matches that filter'}
            body={
              subscriptions.length === 0
                ? 'Add your first recurring payment to start tracking renewals and price changes.'
                : 'Try a different search term, or switch the status filter back to “all”.'
            }
            action={
              subscriptions.length === 0 ? (
                <button className="btn-primary" onClick={onAdd}>
                  <IconPlus width={15} height={15} /> Add subscription
                </button>
              ) : (
                <button
                  className="btn-ghost"
                  onClick={() => {
                    setQuery('');
                    setFilter('all');
                  }}
                >
                  Clear filters
                </button>
              )
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left">
              <thead>
                <tr className="text-[10.5px] uppercase tracking-[0.12em] text-slate-500">
                  <th className="px-4 py-2.5 font-semibold">Service</th>
                  <th className="px-3 py-2.5 font-semibold">Status</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Price</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Monthly</th>
                  <th className="px-3 py-2.5 font-semibold">Next charge</th>
                  <th className="px-3 py-2.5 font-semibold">Price change</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {filtered.map((s) => {
                  const up = s.last_price_change && s.last_price_change.delta > 0.001;
                  const days = s.days_until_renewal;
                  return (
                    <tr
                      key={s.id}
                      onClick={() => onOpen(s.id)}
                      className="group cursor-pointer transition-colors hover:bg-white/[0.03]"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-semibold"
                            style={{
                              background: `${categoryColor(s.category)}1f`,
                              color: categoryColor(s.category),
                              border: `1px solid ${categoryColor(s.category)}44`,
                            }}
                          >
                            {s.name.slice(0, 2).toUpperCase()}
                          </span>
                          <div className="min-w-0">
                            <div className="truncate text-[13px] font-medium text-slate-100">
                              {s.name}
                            </div>
                            <div className="truncate text-[11px] text-slate-500">{s.category}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`text-[11px] font-medium capitalize ${
                            s.status === 'active'
                              ? 'text-mint'
                              : s.status === 'paused'
                                ? 'text-amber'
                                : 'text-slate-500'
                          }`}
                        >
                          {s.status}
                        </span>
                      </td>
                      <td className="tnum px-3 py-3 text-right text-[12.5px] text-slate-200">
                        {money(s.cost, s.currency)}
                        <span className="text-[10.5px] text-slate-500">{CYCLE_SHORT[s.billing_cycle]}</span>
                      </td>
                      <td className="tnum px-3 py-3 text-right text-[12.5px] text-slate-400">
                        {money(s.monthly_cost, s.currency)}
                      </td>
                      <td className="px-3 py-3">
                        {s.status === 'active' ? (
                          <div>
                            <div className="text-[12.5px] text-slate-200">
                              {dateLabel(s.next_renewal_date)}
                            </div>
                            <div
                              className={`text-[11px] ${
                                days <= 3 ? 'text-rose' : days <= 7 ? 'text-amber' : 'text-slate-500'
                              }`}
                            >
                              {relativeDays(days)}
                            </div>
                          </div>
                        ) : (
                          <span className="text-[12px] text-slate-600">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {s.last_price_change && Math.abs(s.last_price_change.delta) > 0.001 ? (
                          <span
                            className={`inline-flex items-center gap-1 text-[12px] font-medium ${
                              up ? 'text-rose' : 'text-mint'
                            }`}
                          >
                            <IconArrowUp
                              width={12}
                              height={12}
                              className={up ? '' : 'rotate-180'}
                            />
                            {up ? '+' : ''}
                            {s.last_price_change.delta_pct.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-[12px] text-slate-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {s.status === 'active' && (
                            <span className="hidden text-[11px] text-slate-600 lg:inline">
                              <IconCalendar width={12} height={12} className="mr-1 inline" />
                              {s.reminder_days}d
                            </span>
                          )}
                          <button
                            className="rounded-lg p-1.5 text-slate-500 opacity-0 transition-opacity hover:bg-white/[0.07] hover:text-white group-hover:opacity-100"
                            onClick={(e) => {
                              e.stopPropagation();
                              onEdit(s);
                            }}
                            aria-label={`Edit ${s.name}`}
                          >
                            <IconPencil width={14} height={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <p className="px-1 text-[11.5px] text-slate-600">
        Monthly figures normalise every cycle (weekly → ÷4.33, quarterly → ÷3, yearly → ÷12) so a
        $99/yr plan counts as $8.25/mo.
      </p>
    </div>
  );
}
