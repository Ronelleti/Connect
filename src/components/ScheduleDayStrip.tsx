"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";
import { formatHebrewDate, getScheduleTimeParts, type ScheduleDay } from "@/lib/dates";

const SHORT_DAY_LABELS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

// Phone-only strip of the week's days above the schedule table: shows which days are on
// screen and jumps straight to a day when tapped, instead of swiping across the table.
export function ScheduleDayStrip({
  days,
  panelRef
}: {
  days: ScheduleDay[];
  panelRef: RefObject<HTMLDivElement | null>;
}) {
  const [visibleDays, setVisibleDays] = useState<number[]>([]);
  const today = getScheduleTimeParts(new Date()).dateOnly;

  // Where the day columns start: the panel's right edge (RTL) minus the pinned shift column.
  const getColumnsStartEdge = useCallback((panel: HTMLDivElement) => {
    const label = panel.querySelector(".grid-header .shift-label-column");
    return label ? label.getBoundingClientRect().left : panel.getBoundingClientRect().right;
  }, []);

  const updateVisibleDays = useCallback(() => {
    const panel = panelRef.current;
    if (!panel) {
      return;
    }
    const start = getColumnsStartEdge(panel);
    const end = panel.getBoundingClientRect().left;
    const headers = [...panel.querySelectorAll(".grid-header .day-header")];
    setVisibleDays(
      headers.flatMap((header, index) => {
        const rect = header.getBoundingClientRect();
        const center = (rect.left + rect.right) / 2;
        return center < start && center > end ? [index] : [];
      })
    );
  }, [getColumnsStartEdge, panelRef]);

  const scrollToDay = useCallback(
    (dayIndex: number, behavior: ScrollBehavior) => {
      const panel = panelRef.current;
      const header = panel?.querySelectorAll(".grid-header .day-header")[dayIndex];
      if (!panel || !header) {
        return;
      }
      panel.scrollBy({ left: header.getBoundingClientRect().right - getColumnsStartEdge(panel), behavior });
    },
    [getColumnsStartEdge, panelRef]
  );

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) {
      return;
    }
    // Open the current week on today's column.
    const todayIndex = days.findIndex((day) => day.date === today);
    if (todayIndex > 0) {
      scrollToDay(todayIndex, "instant");
    } else {
      panel.scrollLeft = 0;
    }
    updateVisibleDays();
    panel.addEventListener("scroll", updateVisibleDays, { passive: true });
    window.addEventListener("resize", updateVisibleDays);
    return () => {
      panel.removeEventListener("scroll", updateVisibleDays);
      window.removeEventListener("resize", updateVisibleDays);
    };
  }, [days, panelRef, scrollToDay, today, updateVisibleDays]);

  return (
    <nav className="schedule-day-strip" aria-label="מעבר בין ימי השבוע">
      {days.map((day) => (
        <button
          key={day.index}
          type="button"
          className={[
            visibleDays.includes(day.index) ? "visible" : "",
            day.date === today ? "today" : ""
          ].join(" ")}
          aria-pressed={visibleDays.includes(day.index)}
          aria-label={`${day.label} ${formatHebrewDate(day.date)}`}
          onClick={() => scrollToDay(day.index, "smooth")}
        >
          <strong>{SHORT_DAY_LABELS[day.index]}</strong>
          <span>{formatHebrewDate(day.date)}</span>
        </button>
      ))}
    </nav>
  );
}
