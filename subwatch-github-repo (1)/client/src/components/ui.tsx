import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { IconAlert, IconCheck, IconX } from './icons';
import type { SubStatus } from '../lib/types';

export function Panel({
  children,
  className = '',
  as: Tag = 'section',
}: {
  children?: ReactNode;
  className?: string;
  as?: 'section' | 'div' | 'aside';
}) {
  return <Tag className={`panel ${className}`}>{children}</Tag>;
}

export function PanelHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-white/[0.06] px-5 py-4">
      <div>
        <h2 className="text-[14px] font-semibold tracking-tight text-white">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[12px] text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatusPill({ status }: { status: SubStatus }) {
  const map = {
    active: 'border-mint/25 bg-mint/10 text-mint',
    paused: 'border-amber/25 bg-amber/10 text-amber',
    cancelled: 'border-white/10 bg-white/[0.05] text-slate-400',
  } as const;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] ${map[status]}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-slate-400">
        {icon}
      </div>
      <div className="text-[14px] font-medium text-slate-200">{title}</div>
      <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-slate-500">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  width = 'max-w-2xl',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative z-10 max-h-[92vh] w-full ${width} animate-pop-in overflow-y-auto rounded-t-3xl border border-white/[0.08] bg-ink-850 shadow-2xl sm:rounded-3xl`}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-white/[0.06] bg-ink-850/95 px-6 py-4 backdrop-blur">
          <div>
            <h2 className="text-[16px] font-semibold tracking-tight text-white">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[12.5px] text-slate-500">{subtitle}</p>}
          </div>
          <button className="btn-quiet -mr-2 p-2" onClick={onClose} aria-label="Close">
            <IconX />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

export type ToastPayload = { id: number; message: string; tone: 'success' | 'error' | 'info' };

export function Toasts({ toasts, onDismiss }: { toasts: ToastPayload[]; onDismiss: (id: number) => void }) {
  return (
    <div className="pointer-events-none fixed bottom-5 left-1/2 z-[60] flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 px-4 sm:left-auto sm:right-5 sm:translate-x-0">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex animate-fade-up items-start gap-2.5 rounded-xl border px-3.5 py-3 text-[13px] shadow-xl backdrop-blur-lg ${
            t.tone === 'error'
              ? 'border-rose/30 bg-rose/15 text-rose'
              : t.tone === 'info'
                ? 'border-white/10 bg-ink-800/95 text-slate-200'
                : 'border-mint/30 bg-mint/15 text-mint'
          }`}
        >
          <span className="mt-0.5 shrink-0">
            {t.tone === 'error' ? <IconAlert width={15} height={15} /> : <IconCheck width={15} height={15} />}
          </span>
          <span className="flex-1 leading-snug">{t.message}</span>
          <button onClick={() => onDismiss(t.id)} className="opacity-60 hover:opacity-100" aria-label="Dismiss">
            <IconX width={13} height={13} />
          </button>
        </div>
      ))}
    </div>
  );
}

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/25 border-t-white ${className}`}
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="panel p-5">
      <div className="skeleton h-3 w-24" />
      <div className="skeleton mt-4 h-7 w-32" />
      <div className="skeleton mt-3 h-3 w-40" />
    </div>
  );
}
