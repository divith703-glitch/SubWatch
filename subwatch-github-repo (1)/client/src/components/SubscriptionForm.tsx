import { useEffect, useMemo, useState } from 'react';
import type { BillingCycle, CatalogItem, Subscription, SubscriptionInput, SubStatus } from '../lib/types';
import { Modal, Spinner } from './ui';
import { CYCLE_LABEL, addMonthsISO, money, todayISO } from '../lib/format';
import { IconAlert, IconCheck, IconSpark } from './icons';

const CATEGORIES = [
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

const CYCLES: BillingCycle[] = ['weekly', 'monthly', 'quarterly', 'semiannual', 'yearly'];
const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'CAD', 'AUD', 'SGD', 'AED', 'BRL', 'JPY'];

function defaultRenewal(cycle: BillingCycle) {
  const months = { weekly: 0, monthly: 1, quarterly: 3, semiannual: 6, yearly: 12 }[cycle];
  if (cycle === 'weekly') {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  }
  return addMonthsISO(todayISO(), months);
}

export default function SubscriptionForm({
  open,
  initial,
  catalog,
  defaultCurrency,
  onClose,
  onSubmit,
  onDelete,
}: {
  open: boolean;
  initial: Subscription | null;
  catalog: CatalogItem[];
  defaultCurrency: string;
  onClose: () => void;
  onSubmit: (input: SubscriptionInput) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Other');
  const [cost, setCost] = useState('');
  const [currency, setCurrency] = useState(defaultCurrency);
  const [cycle, setCycle] = useState<BillingCycle>('monthly');
  const [renewal, setRenewal] = useState(defaultRenewal('monthly'));
  const [started, setStarted] = useState(todayISO());
  const [status, setStatus] = useState<SubStatus>('active');
  const [payment, setPayment] = useState('');
  const [reminder, setReminder] = useState('7');
  const [cancelUrl, setCancelUrl] = useState('');
  const [instructions, setInstructions] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError('');
    setBusy(false);
    setConfirmDelete(false);
    setShowSuggestions(false);
    if (initial) {
      setName(initial.name);
      setCategory(initial.category);
      setCost(String(initial.cost));
      setCurrency(initial.currency);
      setCycle(initial.billing_cycle);
      setRenewal(initial.next_renewal_date.slice(0, 10));
      setStarted(initial.started_on?.slice(0, 10) ?? todayISO());
      setStatus(initial.status);
      setPayment(initial.payment_method ?? '');
      setReminder(String(initial.reminder_days));
      setCancelUrl(initial.cancel_url ?? '');
      setInstructions(initial.cancel_instructions ?? '');
      setNotes(initial.notes ?? '');
    } else {
      setName('');
      setCategory('Other');
      setCost('');
      setCurrency(defaultCurrency);
      setCycle('monthly');
      setRenewal(defaultRenewal('monthly'));
      setStarted(todayISO());
      setStatus('active');
      setPayment('');
      setReminder('7');
      setCancelUrl('');
      setInstructions('');
      setNotes('');
    }
  }, [open, initial, defaultCurrency]);

  const suggestions = useMemo(() => {
    const q = name.trim().toLowerCase();
    if (q.length < 2) return [];
    return catalog
      .filter((c) => c.name.toLowerCase().includes(q) || q.includes(c.name.toLowerCase().split(' ')[0]))
      .slice(0, 5);
  }, [name, catalog]);

  function applySuggestion(item: CatalogItem) {
    setName(item.name);
    setCategory(item.category);
    setCancelUrl(item.cancel_url);
    setInstructions(item.steps.map((s) => `• ${s}`).join('\n'));
    if (!cost) setCost(String(item.typical_price));
    if (item.currency !== currency) setCurrency(item.currency);
    setShowSuggestions(false);
  }

  const costNumber = Number(cost);
  const oldCost = initial?.cost ?? null;
  const priceChanged = initial !== null && Number.isFinite(costNumber) && Math.abs(costNumber - (oldCost ?? 0)) > 0.004;
  const deltaPct =
    priceChanged && oldCost ? ((costNumber - oldCost) / oldCost) * 100 : 0;

  const monthlyEquivalent = (() => {
    if (!Number.isFinite(costNumber) || costNumber <= 0) return null;
    const divisor = { weekly: 52 / 12, monthly: 1, quarterly: 3, semiannual: 6, yearly: 12 }[cycle];
    return costNumber / divisor;
  })();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!name.trim()) return setError('Give the subscription a name.');
    if (!Number.isFinite(costNumber) || costNumber <= 0) return setError('Enter a cost greater than zero.');
    if (!renewal) return setError('Pick the next renewal date.');

    setBusy(true);
    try {
      await onSubmit({
        name: name.trim(),
        category,
        cost: costNumber,
        currency,
        billing_cycle: cycle,
        next_renewal_date: renewal,
        started_on: started || null,
        status,
        payment_method: payment.trim() || null,
        cancel_url: cancelUrl.trim() || null,
        cancel_instructions: instructions.trim() || null,
        notes: notes.trim() || null,
        reminder_days: Number(reminder) || 0,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the subscription');
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? `Edit ${initial.name}` : 'Add a subscription'}
      subtitle={
        initial
          ? 'Changing the cost records a price change so you keep the full history.'
          : 'Anything recurring: streaming, SaaS, hosting, the gym you keep forgetting.'
      }
    >
      <form onSubmit={submit} className="space-y-5">
        <div className="relative">
          <label className="label" htmlFor="sub-name">
            Service name
          </label>
          <input
            id="sub-name"
            className="field"
            placeholder="Netflix, Adobe Creative Cloud, DigitalOcean…"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            autoComplete="off"
          />
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute z-20 mt-1.5 w-full overflow-hidden rounded-xl border border-white/10 bg-ink-800 shadow-2xl">
              <div className="flex items-center gap-1.5 border-b border-white/[0.06] px-3 py-2 text-[10.5px] uppercase tracking-[0.12em] text-slate-500">
                <IconSpark width={12} height={12} /> Known service — cancel guide available
              </div>
              {suggestions.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applySuggestion(s)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[13px] hover:bg-white/[0.06]"
                >
                  <span className="text-slate-200">{s.name}</span>
                  <span className="text-[11px] text-slate-500">
                    {money(s.typical_price, s.currency)} typical
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="sub-cost">
              Price per cycle
            </label>
            <div className="flex gap-2">
              <input
                id="sub-cost"
                className="field flex-1"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                placeholder="12.99"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                required
              />
              <select
                className="field w-[92px] shrink-0"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                aria-label="Currency"
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            {monthlyEquivalent !== null && (
              <p className="mt-1.5 text-[11.5px] text-slate-500">
                ≈ {money(monthlyEquivalent, currency)} / month ·{' '}
                {money(monthlyEquivalent * 12, currency)} / year
              </p>
            )}
          </div>

          <div>
            <label className="label" htmlFor="sub-cycle">
              Billing cycle
            </label>
            <select
              id="sub-cycle"
              className="field"
              value={cycle}
              onChange={(e) => {
                const next = e.target.value as BillingCycle;
                setCycle(next);
                if (!initial) setRenewal(defaultRenewal(next));
              }}
            >
              {CYCLES.map((c) => (
                <option key={c} value={c}>
                  {CYCLE_LABEL[c]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="sub-renewal">
              Next renewal
            </label>
            <input
              id="sub-renewal"
              type="date"
              className="field"
              value={renewal}
              onChange={(e) => setRenewal(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="label" htmlFor="sub-started">
              Subscribed since
            </label>
            <input
              id="sub-started"
              type="date"
              className="field"
              value={started}
              onChange={(e) => setStarted(e.target.value)}
            />
          </div>

          <div>
            <label className="label" htmlFor="sub-category">
              Category
            </label>
            <select
              id="sub-category"
              className="field"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="sub-status">
              Status
            </label>
            <select
              id="sub-status"
              className="field"
              value={status}
              onChange={(e) => setStatus(e.target.value as SubStatus)}
            >
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <div>
            <label className="label" htmlFor="sub-payment">
              Payment method
            </label>
            <input
              id="sub-payment"
              className="field"
              placeholder="Visa •• 4412 / UPI auto-pay"
              value={payment}
              onChange={(e) => setPayment(e.target.value)}
            />
          </div>

          <div>
            <label className="label" htmlFor="sub-reminder">
              Remind me
            </label>
            <select
              id="sub-reminder"
              className="field"
              value={reminder}
              onChange={(e) => setReminder(e.target.value)}
            >
              <option value="0">On the renewal day</option>
              <option value="1">1 day before</option>
              <option value="3">3 days before</option>
              <option value="7">1 week before</option>
              <option value="14">2 weeks before</option>
              <option value="30">1 month before</option>
            </select>
          </div>
        </div>

        {priceChanged && (
          <div className="flex items-start gap-2.5 rounded-xl border border-amber/25 bg-amber/[0.08] px-3.5 py-3 text-[12.5px] text-amber">
            <IconAlert width={15} height={15} className="mt-0.5 shrink-0" />
            <span>
              Price change detected: {money(oldCost ?? 0, currency)} → {money(costNumber, currency)} (
              {deltaPct > 0 ? '+' : ''}
              {deltaPct.toFixed(1)}%). This will be saved to the price history and counted in your
              annual hike total.
            </span>
          </div>
        )}

        <details className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3">
          <summary className="cursor-pointer select-none text-[12.5px] font-medium text-slate-300">
            Cancellation details
            <span className="ml-2 text-[11px] font-normal text-slate-500">
              optional — auto-filled for known services
            </span>
          </summary>
          <div className="mt-3 space-y-3">
            <div>
              <label className="label" htmlFor="sub-cancel-url">
                Cancel page URL
              </label>
              <input
                id="sub-cancel-url"
                className="field"
                placeholder="https://…"
                value={cancelUrl}
                onChange={(e) => setCancelUrl(e.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="sub-instructions">
                How to cancel
              </label>
              <textarea
                id="sub-instructions"
                className="field min-h-[92px] resize-y"
                placeholder="• Account → Plans → Cancel plan&#10;• Watch for the retention offer"
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
              />
            </div>
          </div>
        </details>

        <div>
          <label className="label" htmlFor="sub-notes">
            Notes
          </label>
          <textarea
            id="sub-notes"
            className="field min-h-[64px] resize-y"
            placeholder="Shared with family, annual plan, trial that converts in March…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-rose/25 bg-rose/10 px-3.5 py-2.5 text-[12.5px] text-rose">
            <IconAlert width={15} height={15} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex flex-col-reverse gap-2 border-t border-white/[0.06] pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {initial && onDelete && (
              <button
                type="button"
                className={confirmDelete ? 'btn-danger' : 'btn-quiet'}
                onClick={async () => {
                  if (!confirmDelete) return setConfirmDelete(true);
                  setBusy(true);
                  try {
                    await onDelete();
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Could not delete');
                    setBusy(false);
                  }
                }}
                disabled={busy}
              >
                {confirmDelete ? 'Yes, delete permanently' : 'Delete'}
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn-ghost flex-1 sm:flex-none" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary flex-1 sm:flex-none" disabled={busy}>
              {busy ? <Spinner /> : <IconCheck width={15} height={15} />}
              {initial ? 'Save changes' : 'Add subscription'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
