"use client";

import { Radio, ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { getEmployeeColor } from "@/lib/employeeColors";
import { SHIFT_DEFINITIONS } from "@/lib/shifts";
import type { ShiftType } from "@/lib/types";

interface CurrentShiftEmployee {
  id: string;
  name: string;
  userId: string | null;
}

interface CurrentShiftPayload {
  weekStart: string;
  dayIndex: number;
  shiftType: ShiftType;
  employees: CurrentShiftEmployee[];
}

const REFRESH_MS = 30_000;

export function CurrentShiftBanner() {
  const [current, setCurrent] = useState<CurrentShiftPayload | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/schedule/current", { cache: "no-store" });
    if (response.ok) {
      setCurrent((await response.json()) as CurrentShiftPayload);
    }
  }, []);

  useEffect(() => {
    // Initial data fetching is intentionally synchronized here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const intervalId = window.setInterval(load, REFRESH_MS);
    window.addEventListener("focus", load);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", load);
    };
  }, [load]);

  if (!current) {
    return null;
  }

  const definition = SHIFT_DEFINITIONS[current.shiftType];
  const isUnfilled = current.employees.length === 0;

  return (
    <section
      className={`current-shift-banner ${definition.tone} ${isUnfilled ? "unfilled" : ""}`}
      aria-live="polite"
    >
      <div className="current-shift-icon">
        {isUnfilled ? <ShieldAlert size={18} /> : <Radio size={18} />}
      </div>
      <div className="current-shift-copy">
        <strong>
          כרגע במשמרת {definition.label} · {definition.startsAt}-{definition.endsAt}
        </strong>
        {isUnfilled ? (
          <span>אין עובד משובץ למשמרת הנוכחית</span>
        ) : (
          <div className="current-shift-people">
            {current.employees.map((employee) => (
              <span key={employee.id} style={employeeColorStyle(employee)}>
                <i className="employee-color-dot" aria-hidden="true" />
                {employee.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function employeeColorStyle(employee: CurrentShiftEmployee): CSSProperties {
  const color = getEmployeeColor(employee.userId ?? employee.id);
  return {
    "--employee-color": color.solid,
    "--employee-soft": color.soft
  } as CSSProperties;
}
