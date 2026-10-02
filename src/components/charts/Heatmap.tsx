"use client";

import { DAY_LABELS, DAY_SHORT_LABELS } from "@/lib/labels";
import { useChartTooltip } from "./Tooltip";

const STEPS = ["--seq-0", "--seq-100", "--seq-200", "--seq-300", "--seq-400", "--seq-500", "--seq-600", "--seq-700"];

function step(value: number, max: number) {
  if (value <= 0 || max <= 0) {
    return 0;
  }
  return Math.min(STEPS.length - 1, Math.max(1, Math.ceil((value / max) * (STEPS.length - 1))));
}

function hourRange(hour: number) {
  return `${String(hour).padStart(2, "0")}:00–${String((hour + 1) % 24).padStart(2, "0")}:00`;
}

/** People working in each hour of the week: one-hue sequential scale, more is darker. */
export function HourlyHeatmap({ data }: { data: number[][] }) {
  const { bind, tooltip } = useChartTooltip();
  const max = Math.max(0, ...data.flat());
  return (
    <div>
      <div className="heatmap" role="grid" aria-label="מספר עובדים בכל שעה בשבוע">
        {data.map((hours, day) => (
          <div key={day} role="row" style={{ display: "contents" }}>
            <span className="heat-day" role="rowheader">
              {DAY_SHORT_LABELS[day]}
            </span>
            {hours.map((value, hour) => (
              <span
                key={hour}
                role="gridcell"
                tabIndex={hour === 9 ? 0 : -1}
                className="heat-cell"
                style={{ background: `var(${STEPS[step(value, max)]})` }}
                aria-label={`${DAY_LABELS[day]} ${hourRange(hour)}: ${value} עובדים`}
                {...bind(
                  <>
                    <strong>{value} עובדים</strong>
                    <span>
                      {DAY_LABELS[day]} · <span className="ltr">{hourRange(hour)}</span>
                    </span>
                  </>
                )}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="heat-hours" aria-hidden="true">
        <span />
        {Array.from({ length: 24 }, (_, hour) => (
          <span key={hour}>{hour % 3 === 0 ? String(hour).padStart(2, "0") : ""}</span>
        ))}
      </div>
      <div className="heat-scale" aria-hidden="true">
        <span>0</span>
        {STEPS.map((name) => (
          <i key={name} style={{ background: `var(${name})` }} />
        ))}
        <span>{max} עובדים</span>
      </div>
      {tooltip}
    </div>
  );
}

export function HourlyTable({ data }: { data: number[][] }) {
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>שעה</th>
          {DAY_LABELS.map((label) => (
            <th key={label}>{label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: 24 }, (_, hour) => (
          <tr key={hour}>
            <td className="num ltr">{hourRange(hour)}</td>
            {data.map((hours, day) => (
              <td key={day} className="num">
                {hours[hour]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
