import { useState } from 'react';
import { api } from '../lib/api';
import type { User } from '../lib/types';
import { IconAlert, IconArrowUp, IconCheck, IconShield, IconSpark } from './icons';

const HIGHLIGHTS = [
  { title: 'Every renewal in one place', body: 'Monthly, quarterly and annual plans normalised into one true monthly number.' },
  { title: 'Price increases flagged', body: 'When a provider quietly raises your rate, SubWatch logs the old price, the new one and the annual damage.' },
  { title: 'Cancel without the runaround', body: 'Step-by-step cancellation instructions and the direct link for 35+ popular services.' },
];

export default function AuthScreen({
  onAuth,
  demoEnabled,
}: {
  onAuth: (user: User) => void;
  demoEnabled: boolean;
}) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<'form' | 'demo' | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy('form');
    try {
      const res =
        mode === 'login'
          ? await api.login(email.trim(), password)
          : await api.register(name.trim(), email.trim(), password);
      onAuth(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(null);
    }
  }

  async function demo() {
    setError('');
    setBusy('demo');
    try {
      const res = await api.login('demo@subwatch.app', 'demo1234');
      onAuth(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the demo');
      setBusy(null);
    }
  }

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* Brand / pitch */}
      <div className="relative flex flex-1 flex-col justify-between overflow-hidden px-8 py-10 lg:px-14 lg:py-14">
        <div className="pointer-events-none absolute -left-24 top-16 h-[420px] w-[420px] rounded-full bg-accent/20 blur-[120px]" />
        <div className="pointer-events-none absolute -right-20 bottom-0 h-[320px] w-[320px] rounded-full bg-mint/10 blur-[110px]" />

        <div className="relative">
          <div className="flex items-center gap-3">
            <Logo />
            <div>
              <div className="text-[17px] font-semibold tracking-tight text-white">SubWatch</div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                Subscription intelligence
              </div>
            </div>
          </div>

          <h1 className="mt-14 max-w-2xl text-[34px] font-semibold leading-[1.06] tracking-tight text-white sm:text-[44px] xl:text-[50px]">
            Know what you pay for.
            <span className="block bg-gradient-to-r from-accent-soft via-white to-mint bg-clip-text text-transparent">
              Before it charges you again.
            </span>
          </h1>
          <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-slate-400">
            SubWatch tracks every recurring payment, catches the price increases nobody emails you
            about, and tells you exactly how to cancel the ones you no longer use.
          </p>

          <div className="mt-10 space-y-4">
            {HIGHLIGHTS.map((h) => (
              <div key={h.title} className="flex gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent-soft">
                  <IconCheck width={14} height={14} />
                </span>
                <div>
                  <div className="text-[13.5px] font-medium text-slate-200">{h.title}</div>
                  <div className="text-[13px] leading-relaxed text-slate-500">{h.body}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative mt-12 flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px] uppercase tracking-[0.14em] text-slate-600">
          <span className="inline-flex items-center gap-1.5">
            <IconShield width={13} height={13} /> Data stays in your own database
          </span>
          <span className="inline-flex items-center gap-1.5">
            <IconSpark width={13} height={13} /> Price-change detection
          </span>
        </div>
      </div>

      {/* Form */}
      <div className="flex w-full items-center justify-center border-t border-white/[0.06] bg-ink-900/60 px-6 py-12 backdrop-blur-xl lg:w-[520px] lg:border-l lg:border-t-0">
        <div className="w-full max-w-[360px] animate-fade-up">
          <h2 className="text-[22px] font-semibold tracking-tight text-white">
            {mode === 'login' ? 'Welcome back' : 'Create your account'}
          </h2>
          <p className="mt-1.5 text-[13px] text-slate-500">
            {mode === 'login'
              ? 'Sign in to see this month’s recurring spend.'
              : 'Takes 20 seconds. No card, no spreadsheet.'}
          </p>

          <form onSubmit={submit} className="mt-7 space-y-4">
            {mode === 'register' && (
              <div>
                <label className="label" htmlFor="name">
                  Name
                </label>
                <input
                  id="name"
                  className="field"
                  placeholder="Aarav Sharma"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  required
                />
              </div>
            )}
            <div>
              <label className="label" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                className="field"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                className="field"
                placeholder={mode === 'register' ? 'At least 10 characters' : '••••••••'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-rose/25 bg-rose/10 px-3 py-2.5 text-[12.5px] text-rose">
                <IconAlert width={15} height={15} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button type="submit" className="btn-primary w-full" disabled={busy !== null}>
              {busy === 'form' ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
              {busy !== 'form' && <IconArrowUp width={15} height={15} className="rotate-90" />}
            </button>
          </form>

          {demoEnabled && (
            <>
              <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-[0.16em] text-slate-600">
                <span className="h-px flex-1 bg-white/[0.07]" />
                or
                <span className="h-px flex-1 bg-white/[0.07]" />
              </div>

              <button className="btn-ghost w-full" onClick={demo} disabled={busy !== null}>
                {busy === 'demo' ? 'Loading demo…' : 'Explore the demo workspace'}
              </button>
              <p className="mt-2 text-center text-[11px] text-slate-600">
                14 realistic subscriptions, price history included
              </p>
            </>
          )}

          <p className="mt-7 text-center text-[13px] text-slate-500">
            {mode === 'login' ? 'New to SubWatch?' : 'Already have an account?'}{' '}
            <button
              className="font-medium text-accent-soft hover:text-white"
              onClick={() => {
                setMode(mode === 'login' ? 'register' : 'login');
                setError('');
              }}
              type="button"
            >
              {mode === 'login' ? 'Create an account' : ' Sign in'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

export function Logo({ size = 40 }: { size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-xl bg-gradient-to-br from-accent to-accent-dim text-white shadow-glow"
      style={{ width: size, height: size }}
    >
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none">
        <path
          d="M3 16.5 8 8l3.6 6.2L15 10.5l6 6"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
