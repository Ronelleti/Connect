"use client";

import type { CSSProperties, ReactNode } from "react";
import { formatHours } from "@/lib/shiftTime";
import { teamColor } from "../ui/Avatar";
import { useChartTooltip } from "./Tooltip";

export interface BarRow {
  key: string;
  label: string;
  value: number;
  /** Shown at the bar's tip. */
  valueLabel: string;
  colorSlot?: number | null;
  /** Optional reference line (e.g. weekly max hours). */
  marker?: number;
  tooltip: ReactNode;
  leading?: ReactNode;
}

/** Horizontal bars from one baseline; one series per chart, or team colors when bars are teams. */
export function HBars({ rows, scaleMax, label }: { rows: BarRow[]; scaleMax: number; label: string }) {
  const { bind, tooltip } = useChartTooltip();
  const max = Math.max(scaleMax, ...rows.map((row) => Math.max(row.value, row.marker ?? 0)), 1);
  return (
    <div className="hbars" role="list" aria-label={label}>
      {rows.map((row) => (
        <div
          key={row.key}
          className="hbar-row"
          role="listitem"
          tabIndex={0}
          aria-label={`${row.label}: ${row.valueLabel}`}
          {...bind(row.tooltip)}
        >
          <span className="hbar-name">
            {row.leading}
            <span>{row.label}</span>
          </span>
          <span className="hbar-track">
            <span
              className="hbar-fill"
              style={{ width: `${(row.value / max) * 100}%`, "--team": row.colorSlot ? teamColor(row.colorSlot) : "var(--accent)" } as CSSProperties}
            />
            {row.marker !== undefined ? (
              <span className="hbar-marker" style={{ insetInlineStart: `calc(${(row.marker / max) * 100}% - 1px)` }} aria-hidden="true" />
            ) : null}
          </span>
          <span className="hbar-value">{row.valueLabel}</span>
        </div>
      ))}
      {tooltip}
    </div>
  );
}

/** Staffed (filled) against needed (the lighter track) for each day of the week. */
export function DayColumns({ days }: { days: { label: string; sub: string; required: number; filled: number }[] }) {
  const { bind, tooltip } = useChartTooltip();
  const max = Math.max(1, ...days.map((day) => day.required));
  return (
    <div>
      <div className="columns" role="list" aria-label="איוש מול נדרש לפי יום">
        {days.map((day) => (
          <div
            key={day.label}
            className="column"
            role="listitem"
            tabIndex={0}
            aria-label={`${day.label}: ${day.filled} מתוך ${day.required}`}
            {...bind(
              <>
                <strong>
                  {day.filled}/{day.required}
                </strong>
                <span>
                  {day.label} {day.sub} · {day.required - day.filled > 0 ? `חסרים ${day.required - day.filled}` : "מאויש"}
                </span>
              </>
            )}
          >
            <span className="column-value">{day.required === 0 ? "—" : `${Math.round((day.filled / day.required) * 100)}%`}</span>
            <span className="column-track">
              <span className="column-required" style={{ height: `${(day.required / max) * 100}%` }} />
              <span className="column-filled" style={{ height: `${(day.filled / max) * 100}%` }} />
            </span>
          </div>
        ))}
      </div>
      <div className="column-labels" aria-hidden="true">
        {days.map((day) => (
          <span key={day.label}>
            {day.label}
            <br />
            <span className="muted">{day.sub}</span>
          </span>
        ))}
      </div>
      <div className="chart-legend">
        <span>
          <i style={{ background: "var(--accent)" }} />
          מאויש
        </span>
        <span>
          <i style={{ background: "var(--seq-100)" }} />
          נדרש
        </span>
      </div>
      {tooltip}
    </div>
  );
}

export function hoursLabel(hours: number) {
  return `${formatHours(hours)} ש׳`;
}
