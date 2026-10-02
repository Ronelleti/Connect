"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, formatHebrewDate } from "@/lib/dates";

export function WeekNav({
  weekStart,
  onChange,
  thisWeek,
  thisWeekLabel = "השבוע"
}: {
  weekStart: string;
  onChange: (weekStart: string) => void;
  thisWeek?: string;
  thisWeekLabel?: string;
}) {
  return (
    <div className="week-nav">
      <button type="button" className="icon-button" onClick={() => onChange(addDays(weekStart, -7))} title="השבוע הקודם" aria-label="השבוע הקודם">
        <ChevronRight size={18} />
      </button>
      <span className="week-label" aria-live="polite">
        {formatHebrewDate(weekStart)} – {formatHebrewDate(addDays(weekStart, 6))}
      </span>
      <button type="button" className="icon-button" onClick={() => onChange(addDays(weekStart, 7))} title="השבוע הבא" aria-label="השבוע הבא">
        <ChevronLeft size={18} />
      </button>
      {thisWeek && thisWeek !== weekStart ? (
        <button type="button" className="ghost-button small" onClick={() => onChange(thisWeek)}>
          {thisWeekLabel}
        </button>
      ) : null}
    </div>
  );
}
