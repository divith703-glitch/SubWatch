import { useEffect, useState } from 'react';
import type { HistoryEntry, Subscription, SubStatus } from '../lib/types';
import { api } from '../lib/api';
import {
  CYCLE_LABEL,
  MONTHS_PER_CYCLE,
  categoryColor,
  dateLabel,
  longDate,
  money,
  relativeDays,
} from '../lib/format';
import { StatusPill, Spinner } from './ui';
import {
  IconArrowDown,
  IconArrowUp,
  IconExternal,
  IconPause,
  IconPencil,
  IconPlay,
  IconRefresh,
  IconTrash,
  IconX,
} from './icons';

export default function DetailDrawer({
  subscription,
  onClose,
  onEdit,
  onStatusChange,
  onDelete,
}: {
  subscription: Subscription | null;
  onClose: () => void;
  onEdit: (s: Subscription) => void;
  onStatusChange: (s: Subscription, status: SubStatus) => Promise<void>;
  onDelete: (s: Subscription) => Promise<void>;
}) {
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!subscription) return;
    setHistory(null);
    setConfirmDelete(false);
    setCopied(false);
    api
      .history(subscription.id)
      .then((r) => setHistory(r.history))
      .catch(() => setHistory([]));
  }, [subscription?.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!subscription) return null;
  const s = subscription;
  const color = categoryColor(s.category);
  const pricedUp = s.last_price_change && s.last_price_change.delta > 0.001;

  const increases = (history ?? []).filter((h) => h.new_cost > h.old_cost + 0.001);
  const perYear = 12 / MONTHS_PER_CYCLE[s.billing_cycle];
  const annualHike = (s.last_price_change?.delta ?? 0) * perYear;
  const totalHikeAnnual = increases.reduce((a, h) => a + (h.new_cost - h.old_cost), 0) * perYear;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={s.name}
        className="relative z-10 flex h-full w-full max-w-[480px] animate-fade-up flex-col overflow-y-auto border-l border-white/[0.08] bg-ink-900"
      >
        <header className="sticky top-0 z-10 border-b border-white/[0.07] bg-ink-900/95 px-5 py-4 backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[15px] font-semibold text-white"
                style={{ background: `${color}22`, border: `1px solid ${color}55`, color }}
              >
                {s.name.slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0">
                <h2 className="truncate text-[16px] font-semibold tracking-tight text-white">{s.name}</h2>
                <div className="mt-1 flex items-center gap-2">
                  <StatusPill status={s.status} />
                  <span className="text-[11.5px] text-slate-500">{s.category}</span>
                </div>
              </div>
            </div>
            <button className="btn-quiet -mr-1.5 p-2" onClick={onClose} aria-label="Close">
              <IconX />
            </button>
          </div>
        </header>

        <div className="flex-1 space-y-5 p-5">
          {/* Money */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3.5">
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                Billed
              </div>
              <div className="tnum mt-1 text-[19px] font-semibold text-white">
                {money(s.cost, s.currency)}
                <span className="ml-1 text-[11px] font-normal text-slate-500">
                  {CYCLE_LABEL[s.billing_cycle].toLowerCase()}
                </span>
              </div>
              <div className="mt-1 text-[11.5px] text-slate-500">
                {money(s.monthly_cost, s.currency)}/mo · {money(s.yearly_cost, s.currency)}/yr
              </div>
            </div>
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3.5">
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                Next charge
              </div>
              <div className="mt-1 text-[19px] font-semibold text-white">
                {s.status === 'active' ? dateLabel(s.next_renewal_date) : '—'}
              </div>
              <div className="mt-1 text-[11.5px] text-slate-500">
                {s.status === 'active'
                  ? `${relativeDays(s.days_until_renewal)} · reminder ${s.reminder_days}d before`
                  : s.status === 'paused'
                    ? 'Paused — no charges'
                    : 'Cancelled — no more charges'}
              </div>
            </div>
          </div>

          {pricedUp && (
            <div className="flex items-start gap-2.5 rounded-xl border border-rose/25 bg-rose/[0.08] px-3.5 py-3">
              <IconArrowUp width={15} height={15} className="mt-0.5 shrink-0 text-rose" />
              <div className="text-[12.5px] leading-relaxed text-rose">
                <span className="font-semibold">
                  Price up {s.last_price_change!.delta_pct.toFixed(1)}%
                </span>{' '}
                on {dateLabel(s.last_price_change!.changed_at)} — from{' '}
                {money(s.last_price_change!.old_cost, s.currency)} to{' '}
                {money(s.last_price_change!.new_cost, s.currency)}.
                <span className="block text-rose/70">
                  +{money(annualHike, s.currency)} a year at this billing cycle.
                </span>
              </div>
            </div>
          )}

          {/* Price history */}
          <section>
            <h3 className="section-title mb-2.5 flex items-center justify-between">
              Price history
              {increases.length > 0 && (
                <span className="normal-case tracking-normal text-rose">
                  +{money(totalHikeAnnual, s.currency)}/yr across {increases.length} increase
                  {increases.length > 1 ? 's' : ''}
                </span>
              )}
            </h3>
            {history === null ? (
              <div className="space-y-2">
                <div className="skeleton h-10 w-full" />
                <div className="skeleton h-10 w-full" />
              </div>
            ) : (
              <ul className="space-y-1.5">
                {history.map((h) => {
                  const up = h.new_cost > h.old_cost + 0.001;
                  const down = h.new_cost < h.old_cost - 0.001;
                  return (
                    <li
                      key={h.id}
                      className="flex items-center gap-3 rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2"
                    >
                      <span
                        className={`flex h-6 w-6 items-center justify-center rounded-md border ${
                          up
                            ? 'border-rose/25 bg-rose/10 text-rose'
                            : down
                              ? 'border-mint/25 bg-mint/10 text-mint'
                              : 'border-white/10 bg-white/[0.04] text-slate-500'
                        }`}
                      >
                        {up ? (
                          <IconArrowUp width={12} height={12} />
                        ) : down ? (
                          <IconArrowDown width={12} height={12} />
                        ) : (
                          <IconRefresh width={12} height={12} />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="tnum text-[12.5px] text-slate-200">
                          {up || down ? (
                            <>
                              {money(h.old_cost, h.currency)} → {money(h.new_cost, h.currency)}
                            </>
                          ) : (
                            <>{money(h.new_cost, h.currency)} recorded</>
                          )}
                        </div>
                        <div className="truncate text-[11px] text-slate-500">
                          {longDate(h.changed_at.slice(0, 10))} · {h.note ?? h.source}
                        </div>
                      </div>
                      {(up || down) && (
                        <span
                          className={`tnum shrink-0 text-[11.5px] font-medium ${
                            up ? 'text-rose' : 'text-mint'
                          }`}
                        >
                          {up ? '+' : ''}
                          {h.old_cost ? (((h.new_cost - h.old_cost) / h.old_cost) * 100).toFixed(1) : '0'}%
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Cancellation */}
          <section className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
            <h3 className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-white">
              How to cancel
            </h3>
            {s.cancel_instructions ? (
              <ul className="space-y-1.5 text-[12.5px] leading-relaxed text-slate-400">
                {s.cancel_instructions.split('\n').filter(Boolean).map((line, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-slate-600" />
                    <span>{line.replace(/^•\s*/, '')}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[12.5px] leading-relaxed text-slate-500">
                No cancel guide saved yet. Edit this subscription to add the steps — future you will
                thank present you.
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {s.cancel_url && (
                <a
                  href={s.cancel_url}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-ghost !py-1.5 text-[12px]"
                >
                  <IconExternal width={13} height={13} /> Open cancel page
                </a>
              )}
              <button
                className="btn-quiet !py-1.5 text-[12px]"
                onClick={async () => {
                  const text = `${s.name} — how to cancel:\n${s.cancel_instructions ?? ''}\n${
                    s.cancel_url ?? ''
                  }`;
                  try {
                    await navigator.clipboard.writeText(text.trim());
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1800);
                  } catch {
                    setCopied(false);
                  }
                }}
              >
                {copied ? 'Copied' : 'Copy steps'}
              </button>
            </div>
          </section>

          {(s.payment_method || s.notes || s.started_on) && (
            <section className="space-y-2 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 text-[12.5px]">
              {s.started_on && (
                <div className="flex justify-between gap-4">
                  <span className="text-slate-500">Subscribed since</span>
                  <span className="text-slate-300">{longDate(s.started_on)}</span>
                </div>
              )}
              {s.payment_method && (
                <div className="flex justify-between gap-4">
                  <span className="text-slate-500">Paid with</span>
                  <span className="text-slate-300">{s.payment_method}</span>
                </div>
              )}
              {s.notes && (
                <div className="border-t border-white/[0.06] pt-2 text-slate-400">{s.notes}</div>
              )}
            </section>
          )}
        </div>

        <footer className="sticky bottom-0 border-t border-white/[0.07] bg-ink-900/95 px-5 py-4 backdrop-blur">
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary flex-1 !py-2 text-[12.5px]" onClick={() => onEdit(s)}>
              <IconPencil width={14} height={14} /> Edit
            </button>
            {s.status === 'active' ? (
              <button
                className="btn-ghost !py-2 text-[12.5px]"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  await onStatusChange(s, 'paused');
                  setBusy(false);
                }}
              >
                {busy ? <Spinner /> : <IconPause width={14} height={14} />} Pause
              </button>
            ) : (
              <button
                className="btn-ghost !py-2 text-[12.5px]"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  await onStatusChange(s, 'active');
                  setBusy(false);
                }}
              >
                {busy ? <Spinner /> : <IconPlay width={14} height={14} />} Resume
              </button>
            )}
            <button
              className="btn-quiet !py-2 text-[12.5px]"
              disabled={busy}
              onClick={async () => {
                if (!confirmDelete) return setConfirmDelete(true);
                setBusy(true);
                await onDelete(s);
                setBusy(false);
              }}
            >
              <IconTrash width={14} height={14} />
              {confirmDelete ? 'Confirm' : 'Delete'}
            </button>
          </div>
          {s.status === 'active' && (
            <button
              className="btn-danger mt-2 w-full !py-2 text-[12.5px]"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await onStatusChange(s, 'cancelled');
                setBusy(false);
              }}
            >
              {busy ? <Spinner /> : <IconCheck />} Mark as cancelled — stop counting this cost
            </button>
          )}
        </footer>
      </aside>
    </div>
  );
}

function IconCheck() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="m5 12.5 4.5 4.5L19 6.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
