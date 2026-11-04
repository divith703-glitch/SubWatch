import { useId } from 'react';

type Slice = { label: string; value: number; color: string };

export function Donut({
  data,
  size = 168,
  thickness = 16,
  centerLabel,
  centerValue,
}: {
  data: Slice[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string;
}) {
  const id = useId();
  const total = data.reduce((a, d) => a + d.value, 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.055)"
          strokeWidth={thickness}
        />
        {total > 0 &&
          data.map((d, i) => {
            const fraction = d.value / total;
            const dash = Math.max(fraction * circumference - 2.5, 0);
            const el = (
              <circle
                key={`${id}-${i}`}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={d.color}
                strokeWidth={thickness}
                strokeLinecap="round"
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-offset}
                style={{ transition: 'stroke-dasharray .6s ease' }}
              >
                <title>{`${d.label}: ${((fraction * 100) | 0)}%`}</title>
              </circle>
            );
            offset += fraction * circumference;
            return el;
          })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="tnum text-[22px] font-semibold leading-none text-white">{centerValue}</span>
        <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          {centerLabel}
        </span>
      </div>
    </div>
  );
}

export function TrendBars({
  data,
  format,
  height = 132,
}: {
  data: { label: string; total: number }[];
  format: (n: number) => string;
  height?: number;
}) {
  const rawMax = Math.max(...data.map((d) => d.total), 1);
  const rawMin = Math.min(...data.map((d) => d.total));
  // Start the axis just below the lowest month so small changes stay visible,
  // and label the baseline so the chart is never misleading.
  const floor = Math.max(0, rawMin - (rawMax - rawMin) * 0.4);
  const span = Math.max(rawMax - floor, 0.01);
  const max = rawMax;
  const lastIndex = data.length - 1;
  const delta =
    data.length > 1 && data[0].total > 0
      ? ((data[lastIndex].total - data[0].total) / data[0].total) * 100
      : 0;
  const barArea = height - 20;

  return (
    <div>
      <div className="flex items-end gap-2" style={{ height }}>
        {data.map((d, i) => {
          const h = Math.max(((d.total - floor) / span) * barArea, 6);
          return (
            <div
              key={d.label + i}
              className="group relative flex h-full flex-1 flex-col items-center justify-end"
            >
              <span className="pointer-events-none absolute -top-1 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md border border-white/10 bg-ink-800 px-1.5 py-0.5 text-[10px] text-slate-200 opacity-0 transition-opacity group-hover:opacity-100">
                {format(d.total)}
              </span>
              <div
                className={`w-full rounded-t-md transition-all ${
                  i === lastIndex
                    ? 'bg-gradient-to-t from-accent-dim to-accent'
                    : 'bg-white/[0.13] group-hover:bg-white/25'
                }`}
                style={{ height: h }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between">
        {data.map((d, i) => (
          <span
            key={d.label + i}
            className={`flex-1 text-center text-[10px] font-medium uppercase tracking-wider ${
              i === lastIndex ? 'text-slate-300' : 'text-slate-600'
            }`}
          >
            {d.label}
          </span>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-white/[0.06] pt-3 text-[11px] text-slate-500">
        <span>Monthly cost, last 6 months</span>
        <span className={delta > 0.5 ? 'text-rose' : delta < -0.5 ? 'text-mint' : 'text-slate-400'}>
          {delta > 0 ? '+' : ''}
          {delta.toFixed(1)}% vs 6 months ago
        </span>
      </div>
      <div className="mt-1 text-[10px] text-slate-600">
        Axis {format(floor)} – {format(max)}
      </div>
    </div>
  );
}

export function Meter({ value, max, color = '#7C6CFF' }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  );
}
