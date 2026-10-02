"use client";

import { BarChart3, Table2 } from "lucide-react";
import { useState, type ReactNode } from "react";

/** A card holding one chart, with a chart/table switch so every value is reachable without color or hover. */
export function ChartCard({
  title,
  subtitle,
  table,
  children,
  className,
  actions
}: {
  title: string;
  subtitle?: ReactNode;
  table?: ReactNode;
  children: ReactNode;
  className?: string;
  actions?: ReactNode;
}) {
  const [view, setView] = useState<"chart" | "table">("chart");
  return (
    <section className={`card chart-card ${className ?? ""}`} aria-label={title}>
      <div className="card-header">
        <div>
          <h2>{title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        <div className="toolbar">
          {actions}
          {table ? (
            <div className="segmented" role="group" aria-label="תצוגה">
              <button type="button" aria-pressed={view === "chart"} onClick={() => setView("chart")} title="גרף">
                <BarChart3 size={15} />
                <span className="sr-only">גרף</span>
              </button>
              <button type="button" aria-pressed={view === "table"} onClick={() => setView("table")} title="טבלה">
                <Table2 size={15} />
                <span className="sr-only">טבלה</span>
              </button>
            </div>
          ) : null}
        </div>
      </div>
      {view === "chart" || !table ? children : <div className="table-scroll">{table}</div>}
    </section>
  );
}
