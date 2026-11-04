import { useMemo, useState } from 'react';
import type { CatalogItem } from '../lib/types';
import { EmptyState, Panel, PanelHeader } from '../components/ui';
import { IconChevron, IconExternal, IconLifebuoy, IconSearch } from '../components/icons';
import { money } from '../lib/format';

export default function CancelGuide({
  catalog,
  onAddFromGuide,
}: {
  catalog: CatalogItem[];
  onAddFromGuide: (item: CatalogItem) => void;
}) {
  const [query, setQuery] = useState('');
  const [openKey, setOpenKey] = useState<string | null>(null);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter(
      (c) => c.name.toLowerCase().includes(q) || c.category.toLowerCase().includes(q)
    );
  }, [catalog, query]);

  const byCategory = useMemo(() => {
    const groups = new Map<string, CatalogItem[]>();
    for (const item of items) {
      const list = groups.get(item.category) ?? [];
      list.push(item);
      groups.set(item.category, list);
    }
    return [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [items]);

  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeader
          title="Cancellation playbook"
          subtitle={`${catalog.length} popular services with the exact steps and the direct cancel link`}
          action={
            <div className="relative">
              <IconSearch
                width={14}
                height={14}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500"
              />
              <input
                className="field !w-[190px] !py-1.5 pl-8 text-[12.5px]"
                placeholder="Find a service…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          }
        />

        {items.length === 0 ? (
          <EmptyState
            icon={<IconLifebuoy />}
            title="No guide for that service yet"
            body="Add the subscription anyway — you can store the cancel URL and steps yourself in the cancellation details section."
            action={
              <button className="btn-ghost" onClick={() => setQuery('')}>
                Clear search
              </button>
            }
          />
        ) : (
          <div className="columns-1 gap-x-6 p-4 sm:px-5 lg:columns-2 2xl:columns-3">
            {byCategory.map(([category, list]) => (
              <div key={category} className="mb-3 break-inside-avoid rounded-xl border border-white/[0.06] bg-white/[0.015] px-3 py-3">
                <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                  {category}
                </div>
                <ul className="space-y-1">
                  {list.map((item) => {
                    const open = openKey === item.key;
                    return (
                      <li key={item.key} className="rounded-xl border border-transparent hover:border-white/[0.07]">
                        <button
                          onClick={() => setOpenKey(open ? null : item.key)}
                          className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-white/[0.03]"
                          aria-expanded={open}
                        >
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-[10px] font-semibold text-slate-300">
                            {item.name.slice(0, 2).toUpperCase()}
                          </span>
                          <span className="flex-1 truncate text-[13px] text-slate-200">{item.name}</span>
                          <span className="tnum hidden text-[11.5px] text-slate-500 sm:block">
                            ~{money(item.typical_price, item.currency)}
                          </span>
                          <IconChevron
                            width={14}
                            height={14}
                            className={`shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`}
                          />
                        </button>
                        {open && (
                          <div className="animate-fade-up px-2 pb-3 pl-12">
                            <ol className="space-y-1.5 text-[12.5px] leading-relaxed text-slate-400">
                              {item.steps.map((step, i) => (
                                <li key={i} className="flex gap-2">
                                  <span className="mt-[3px] flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-white/[0.07] text-[9.5px] font-semibold text-slate-400">
                                    {i + 1}
                                  </span>
                                  <span>{step}</span>
                                </li>
                              ))}
                            </ol>
                            <div className="mt-2.5 flex flex-wrap gap-2">
                              {item.cancel_url && (
                                <a
                                  href={item.cancel_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="btn-ghost !py-1 text-[11.5px]"
                                >
                                  <IconExternal width={12} height={12} /> Open cancel page
                                </a>
                              )}
                              <button
                                className="btn-quiet !py-1 text-[11.5px]"
                                onClick={() => onAddFromGuide(item)}
                              >
                                Track this subscription
                              </button>
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel className="p-5">
        <h3 className="text-[13px] font-semibold text-white">General rules that save money</h3>
        <ul className="mt-2.5 grid gap-2 text-[12.5px] leading-relaxed text-slate-400 sm:grid-cols-2">
          <li>• Cancel at least 24 hours before the renewal date — many services renew at midnight in their own timezone.</li>
          <li>• If a card was stored, also revoke the auto-debit mandate with your bank; cancelling the plan does not always stop it.</li>
          <li>• Free trials convert silently. Add them here the day you start, with the renewal date set.</li>
          <li>• Ask support for a refund on a charge you did not expect — first-time goodwill refunds are common.</li>
        </ul>
      </Panel>
    </div>
  );
}
