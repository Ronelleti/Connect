import type { ReactNode } from "react";

export function Sparkline({ values, max = 100, label }: { values: number[]; max?: number; label: string }) {
  if (values.length < 2) {
    return null;
  }
  const width = 120;
  const height = 32;
  const top = Math.max(max, ...values);
  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * (width - 8) + 4;
    const y = height - 4 - (value / top) * (height - 8);
    return [x, y] as const;
  });
  const [lastX, lastY] = points[points.length - 1];
  return (
    <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} preserveAspectRatio="none" style={{ direction: "ltr" }}>
      <polyline
        points={points.map(([x, y]) => `${x},${y}`).join(" ")}
        fill="none"
        stroke="var(--muted)"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={lastX} cy={lastY} r={4} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
    </svg>
  );
}

export function Meter({ value, max, tone, label }: { value: number; max: number; tone?: "warning" | "critical"; label: string }) {
  const percent = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className={`meter ${tone ?? ""}`} role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label={label}>
      <span style={{ width: `${percent}%` }} />
    </div>
  );
}

export function StatTile({
  label,
  value,
  unit,
  sub,
  icon,
  children
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  sub?: ReactNode;
  icon?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="card stat-tile">
      <span className="stat-label">
        {icon}
        {label}
      </span>
      <span className="stat-value">
        {value}
        {unit ? <small>{unit}</small> : null}
      </span>
      {children}
      {sub ? <span className="stat-sub">{sub}</span> : null}
    </div>
  );
}
