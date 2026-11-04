import type { ReactNode } from 'react';

export default function KpiCard({
  label,
  value,
  hint,
  icon,
  tone = 'neutral',
  footer,
}: {
  label: string;
  value: string;
  hint?: ReactNode;
  icon: ReactNode;
  tone?: 'neutral' | 'accent' | 'danger' | 'success';
  footer?: ReactNode;
}) {
  const tones = {
    neutral: 'text-slate-400 bg-white/[0.04] border-white/10',
    accent: 'text-accent-soft bg-accent/12 border-accent/25',
    danger: 'text-rose bg-rose/12 border-rose/25',
    success: 'text-mint bg-mint/12 border-mint/25',
  } as const;

  return (
    <div className="panel panel-hover flex flex-col justify-between p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.13em] text-slate-500">
          {label}
        </span>
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-lg border ${tones[tone]}`}
        >
          {icon}
        </span>
      </div>
      <div className="mt-3">
        <div className="kpi-value">{value}</div>
        {hint && <div className="mt-2 text-[12px] text-slate-500">{hint}</div>}
      </div>
      {footer && <div className="mt-3 border-t border-white/[0.06] pt-3">{footer}</div>}
    </div>
  );
}
