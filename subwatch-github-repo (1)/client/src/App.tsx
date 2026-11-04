import { useCallback, useEffect, useMemo, useState } from 'react';
import AuthScreen, { Logo } from './components/AuthScreen';
import Dashboard from './pages/Dashboard';
import Subscriptions from './pages/Subscriptions';
import Insights from './pages/Insights';
import CancelGuide from './pages/CancelGuide';
import SubscriptionForm from './components/SubscriptionForm';
import DetailDrawer from './components/DetailDrawer';
import { Spinner, Toasts, type ToastPayload } from './components/ui';
import {
  IconChart,
  IconGauge,
  IconLifebuoy,
  IconLogout,
  IconMenu,
  IconPlus,
  IconRefresh,
  IconStack,
  IconX,
  IconBell,
} from './components/icons';
import { ApiError, api } from './lib/api';
import AccountDialog from './components/AccountDialog';
import type {
  CatalogItem,
  Meta,
  Subscription,
  SubscriptionInput,
  SubStatus,
  Summary,
  User,
} from './lib/types';
import { money, relativeDays } from './lib/format';

type Page = 'dashboard' | 'subscriptions' | 'insights' | 'guide';

const NAV: { id: Page; label: string; icon: typeof IconGauge; blurb: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: IconGauge, blurb: 'Renewals, spend and price alerts at a glance' },
  { id: 'subscriptions', label: 'Subscriptions', icon: IconStack, blurb: 'Every recurring payment you have on file' },
  { id: 'insights', label: 'Insights', icon: IconChart, blurb: 'Where the money goes and how prices moved' },
  { id: 'guide', label: 'Cancel guide', icon: IconLifebuoy, blurb: 'Step-by-step cancellation help' },
];

export default function App() {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [page, setPage] = useState<Page>('dashboard');
  const [mobileNav, setMobileNav] = useState(false);

  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Subscription | null>(null);
  const [drawerId, setDrawerId] = useState<number | null>(null);
  const [toasts, setToasts] = useState<ToastPayload[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);

  const toast = useCallback((message: string, tone: ToastPayload['tone'] = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  const loadData = useCallback(async () => {
    const [subsRes, summaryRes] = await Promise.all([api.subscriptions(), api.summary()]);
    setSubscriptions(subsRes.subscriptions);
    setSummary(summaryRes);
  }, []);

  // Boot: the session is an HttpOnly cookie, so ask the API who we are.
  useEffect(() => {
    (async () => {
      try {
        const { user: me } = await api.session();
        if (!me) {
          setUser(null);
          return;
        }
        setUser(me);
        await loadData();
      } catch {
        setUser(null);
      } finally {
        setBooting(false);
        setLoading(false);
      }
    })();
  }, [loadData]);

  useEffect(() => {
    api
      .meta()
      .then(setMeta)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!user) return;
    api.catalog().then((r) => setCatalog(r.items)).catch(() => undefined);
  }, [user]);

  useEffect(() => {
    document.title =
      page === 'dashboard'
        ? 'SubWatch — Subscription & Price Increase Detector'
        : `${NAV.find((n) => n.id === page)?.label} · SubWatch`;
  }, [page]);

  const drawerSub = useMemo(
    () => subscriptions.find((s) => s.id === drawerId) ?? null,
    [subscriptions, drawerId]
  );

  function handleAuth(u: User) {
    setUser(u);
    setLoading(true);
    loadData()
      .catch(() => toast('Could not load your subscriptions', 'error'))
      .finally(() => setLoading(false));
  }

  async function signOut() {
    // Revokes the token version server-side, then clears the cookies.
    await api.logout().catch(() => undefined);
    setUser(null);
    setSubscriptions([]);
    setSummary(null);
    setPage('dashboard');
  }

  async function handleSubmit(input: SubscriptionInput) {
    if (editing) {
      const res = await api.updateSubscription(editing.id, input);
      toast(
        res.price_change_logged
          ? `${input.name} saved — price change logged`
          : `${input.name} updated`
      );
    } else {
      await api.createSubscription(input);
      toast(`${input.name} is now being tracked`);
    }
    setFormOpen(false);
    setEditing(null);
    await loadData();
  }

  async function handleDelete(sub: Subscription) {
    await api.deleteSubscription(sub.id);
    toast(`${sub.name} removed`, 'info');
    setFormOpen(false);
    setEditing(null);
    setDrawerId(null);
    await loadData();
  }

  async function handleStatus(sub: Subscription, status: SubStatus) {
    await api.updateSubscription(sub.id, { status });
    toast(
      status === 'cancelled'
        ? `${sub.name} marked cancelled — ${money(sub.yearly_cost, sub.currency)}/yr off your total`
        : status === 'paused'
          ? `${sub.name} paused`
          : `${sub.name} is active again`
    );
    await loadData();
  }

  async function runSync() {
    if (meta && !meta.provider_sync.available) {
      toast('Provider price sync is not configured on this deployment', 'error');
      return;
    }
    setSyncing(true);
    try {
      const res = await api.providerSync();
      toast(res.message, res.changes.length ? 'success' : 'info');
      await loadData();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Provider scan failed', 'error');
    } finally {
      setSyncing(false);
    }
  }

  async function seedDemo() {
    setSyncing(true);
    try {
      await api.seedDemo();
      await loadData();
      toast('Demo portfolio loaded — 14 subscriptions with price history');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not load demo data', 'error');
    } finally {
      setSyncing(false);
    }
  }

  async function exportCsv() {
    try {
      const res = await fetch(api.exportUrl(), { credentials: 'include' });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'subwatch-subscriptions.csv';
      a.click();
      URL.revokeObjectURL(url);
      toast('CSV exported', 'info');
    } catch {
      toast('Export failed', 'error');
    }
  }

  if (booting) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-3 text-slate-500">
        <Spinner /> Loading SubWatch…
      </div>
    );
  }

  if (!user) return <AuthScreen onAuth={handleAuth} demoEnabled={meta?.demo_enabled ?? false} />;

  const activePage = NAV.find((n) => n.id === page)!;
  const alerts = summary?.alerts ?? [];
  const nextRenewal = summary?.upcoming[0];

  return (
    <div className="min-h-screen lg:flex">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-[248px] shrink-0 border-r border-white/[0.06] bg-ink-900/95 backdrop-blur-xl transition-transform lg:static lg:translate-x-0 lg:bg-ink-900/40 ${
          mobileNav ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between px-5 py-5">
            <button className="flex items-center gap-2.5 text-left" onClick={() => setPage('dashboard')}>
              <Logo size={34} />
              <span>
                <span className="block text-[15px] font-semibold tracking-tight text-white">SubWatch</span>
                <span className="block whitespace-nowrap text-[9.5px] uppercase tracking-[0.1em] text-slate-500">
                  no surprise renewals
                </span>
              </span>
            </button>
            <button className="btn-quiet p-2 lg:hidden" onClick={() => setMobileNav(false)} aria-label="Close menu">
              <IconX />
            </button>
          </div>

          <nav className="space-y-1 px-3">
            {NAV.map((item) => {
              const Icon = item.icon;
              const active = page === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setPage(item.id);
                    setMobileNav(false);
                  }}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] font-medium transition-colors ${
                    active
                      ? 'bg-white/[0.07] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.07)]'
                      : 'text-slate-400 hover:bg-white/[0.03] hover:text-slate-200'
                  }`}
                >
                  <Icon width={16} height={16} className={active ? 'text-accent-soft' : ''} />
                  {item.label}
                  {item.id === 'dashboard' && alerts.length > 0 && (
                    <span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-amber px-1 text-[9.5px] font-bold text-ink-950">
                      {alerts.length}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          <div className="mx-3 mt-4 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3.5">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.13em] text-slate-500">
              <IconBell width={12} height={12} /> Renewal radar
            </div>
            {nextRenewal ? (
              <>
                <div className="mt-2 truncate text-[13px] font-medium text-white">{nextRenewal.name}</div>
                <div className="mt-0.5 text-[11.5px] text-slate-500">
                  {money(nextRenewal.cost, nextRenewal.currency)} · {relativeDays(nextRenewal.days_until)}
                </div>
                <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-white/[0.08]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber to-rose"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.max(6, ((14 - Math.min(nextRenewal.days_until, 14)) / 14) * 100)
                      )}%`,
                    }}
                  />
                </div>
              </>
            ) : (
              <div className="mt-2 text-[11.5px] text-slate-500">
                Nothing scheduled. Add a subscription to start tracking.
              </div>
            )}
          </div>

          <div className="mt-auto px-3 pb-4">
            <div className="flex items-center gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
              <button
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/20 text-[12px] font-semibold text-accent-soft transition-colors hover:bg-accent/30 hover:text-white"
                onClick={() => setAccountOpen(true)}
                title="Account settings"
                aria-label="Account settings"
              >
                {user.name.slice(0, 1).toUpperCase()}
              </button>
              <button
                className="min-w-0 flex-1 text-left"
                onClick={() => setAccountOpen(true)}
                aria-label="Account settings"
              >
                <div className="truncate text-[12.5px] font-medium text-slate-200">{user.name}</div>
                <div className="truncate text-[10.5px] text-slate-500">{user.email}</div>
              </button>
              <button
                className="rounded-lg p-1.5 text-slate-500 hover:bg-white/[0.07] hover:text-white"
                onClick={signOut}
                title="Sign out"
                aria-label="Sign out"
              >
                <IconLogout width={15} height={15} />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {mobileNav && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileNav(false)}
        />
      )}

      {/* Main */}
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 border-b border-white/[0.06] bg-ink-950/85 px-4 py-3.5 backdrop-blur-xl sm:px-6">
          <div className="mx-auto flex max-w-[1300px] items-center gap-3">
            <button
              className="btn-quiet -ml-1 p-2 lg:hidden"
              onClick={() => setMobileNav(true)}
              aria-label="Open menu"
            >
              <IconMenu />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-[17px] font-semibold tracking-tight text-white">
                {activePage.label}
              </h1>
              <p className="hidden truncate text-[12px] text-slate-500 sm:block">{activePage.blurb}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="btn-ghost !py-2 text-[12.5px]"
                onClick={runSync}
                disabled={syncing}
                title="Detect price changes from the provider feed"
              >
                <IconRefresh width={14} height={14} className={syncing ? 'animate-spin' : ''} />
                <span className="hidden sm:inline">{syncing ? 'Scanning…' : 'Scan prices'}</span>
              </button>
              <button
                className="btn-primary !py-2 text-[12.5px]"
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                <IconPlus width={14} height={14} />
                <span className="hidden sm:inline">Add subscription</span>
                <span className="sm:hidden">Add</span>
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1300px] px-4 py-4 sm:px-6 sm:py-6">
          {page === 'dashboard' && (
            <Dashboard
              summary={summary}
              loading={loading}
              onOpenSub={setDrawerId}
              onSync={runSync}
              syncing={syncing}
              onAdd={() => {
                setEditing(null);
                setFormOpen(true);
              }}
              onSeed={seedDemo}
              onGoSubscriptions={() => setPage('subscriptions')}
              greetingName={user.name.split(' ')[0]}
              syncAvailable={meta?.provider_sync.available ?? true}
            />
          )}
          {page === 'subscriptions' && (
            <Subscriptions
              subscriptions={subscriptions}
              summary={summary}
              onOpen={setDrawerId}
              onEdit={(s) => {
                setEditing(s);
                setFormOpen(true);
              }}
              onAdd={() => {
                setEditing(null);
                setFormOpen(true);
              }}
              onExport={exportCsv}
            />
          )}
          {page === 'insights' && <Insights summary={summary} onOpenSub={setDrawerId} />}
          {page === 'guide' && (
            <CancelGuide
              catalog={catalog}
              onAddFromGuide={(item) => {
                setEditing(null);
                setFormOpen(true);
                setPage('subscriptions');
                void item;
              }}
            />
          )}
        </main>
      </div>

      <SubscriptionForm
        open={formOpen}
        initial={editing}
        catalog={catalog}
        defaultCurrency={user.currency}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSubmit={handleSubmit}
        onDelete={editing ? () => handleDelete(editing) : undefined}
      />

      <DetailDrawer
        subscription={drawerSub}
        onClose={() => setDrawerId(null)}
        onEdit={(s) => {
          setDrawerId(null);
          setEditing(s);
          setFormOpen(true);
        }}
        onStatusChange={handleStatus}
        onDelete={handleDelete}
      />

      <AccountDialog
        open={accountOpen}
        user={user}
        onClose={() => setAccountOpen(false)}
        onUserChange={setUser}
        onDeleted={() => {
          setAccountOpen(false);
          setUser(null);
          setSubscriptions([]);
          setSummary(null);
          toast('Account deleted', 'info');
        }}
      />

      <Toasts toasts={toasts} onDismiss={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />
    </div>
  );
}
