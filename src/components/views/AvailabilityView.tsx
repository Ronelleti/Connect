"use client";

import { Check, CircleSlash, Palmtree, Star } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { addDays, formatHebrewDate } from "@/lib/dates";
import { DAY_LABELS } from "@/lib/labels";
import { runsOnWeekday, timeRangeLabel } from "@/lib/shiftTime";
import type { Assignment, AvailabilityEntry, AvailabilityStatus, ShiftTemplate } from "@/lib/types";
import { AppShell, type ShellProps } from "../shell/AppShell";
import { useToast } from "../ui/useToast";
import { WeekNav } from "../ui/WeekNav";

interface AvailabilityData {
  weekStart: string;
  openWeek: string;
  templates: ShiftTemplate[];
  entries: AvailabilityEntry[];
  assignments: Assignment[];
  submitted: boolean;
}

// Tapping a shift cycles: no preference → prefer → can't → no preference.
const NEXT_STATUS: Record<string, AvailabilityStatus | null> = {
  none: "PREFERRED",
  PREFERRED: "UNAVAILABLE",
  UNAVAILABLE: null
};

export function AvailabilityView({ today, ...shell }: ShellProps & { today: string }) {
  const [weekStart, setWeekStart] = useState<string | null>(null);
  const [data, setData] = useState<AvailabilityData | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const { show, toast } = useToast();

  const load = useCallback(async (week: string | null) => {
    const result = await api<AvailabilityData>(`/api/availability${week ? `?week=${week}` : ""}`);
    if (result.ok) {
      setData(result.data);
      setWeekStart(result.data.weekStart);
    } else {
      show(result.error ?? "הטעינה נכשלה.");
    }
  }, [show]);

  useEffect(() => {
    // Initial fetch is intentionally synchronized here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(null);
  }, [load]);

  async function save(workDate: string, shiftTemplateId: string | null, status: AvailabilityStatus | null) {
    const key = `${workDate}|${shiftTemplateId}`;
    setSaving(key);
    const result = await api("/api/availability", { method: "PUT", body: { workDate, shiftTemplateId, status } });
    setSaving(null);
    if (!result.ok) {
      show(result.error ?? "השמירה נכשלה.");
      return;
    }
    await load(weekStart);
  }

  async function submit() {
    if (!weekStart) return;
    const result = await api("/api/availability/submission", { method: "POST", body: { weekStart } });
    if (result.ok) {
      show("תודה! הזמינות לשבוע נשמרה.");
      await load(weekStart);
    } else {
      show(result.error ?? "השמירה נכשלה.");
    }
  }

  const isOpenWeek = data && data.weekStart === data.openWeek;

  return (
    <AppShell {...shell} title="הזמינות שלי" subtitle={shell.teamName ?? undefined}>
      <div className="page-intro">
        <div>
          <h2>מתי נוח לך לעבוד?</h2>
          <p>סמנו לכל משמרת אם אתם מעדיפים אותה או לא יכולים, או סמנו יום חופש. כל השאר נחשב &quot;זמין&quot;.</p>
        </div>
        {weekStart ? <WeekNav weekStart={weekStart} onChange={(week) => void load(week)} thisWeek={data?.openWeek} thisWeekLabel="השבוע הפתוח" /> : null}
      </div>

      <div className="availability-legend">
        <span>
          <span className="status-icon good"><Star size={10} /></span>
          מעדיף/ה
        </span>
        <span>
          <span className="status-icon critical"><CircleSlash size={10} /></span>
          לא יכול/ה
        </span>
        <span>
          <span className="status-icon info"><Palmtree size={10} /></span>
          יום חופש
        </span>
        {isOpenWeek ? <span className="badge accent">השבוע הפתוח למילוי</span> : null}
        {data?.submitted ? (
          <span className="badge good">
            <Check size={12} />
            מילאת את השבוע הזה
          </span>
        ) : null}
      </div>

      {!data ? (
        <p className="empty-state">טוען...</p>
      ) : data.templates.length === 0 ? (
        <p className="empty-state">לצוות שלך עוד לא הוגדרו משמרות.</p>
      ) : (
        <div className="availability-grid">
          {DAY_LABELS.map((label, index) => {
            const date = addDays(data.weekStart, index);
            const dayEntry = data.entries.find((entry) => entry.workDate === date && entry.shiftTemplateId === null);
            const dayOff = dayEntry?.status === "TIME_OFF";
            const past = date < today;
            const templates = data.templates.filter((template) => runsOnWeekday(template.weekdays, index));
            const scheduled = data.assignments.filter((assignment) => assignment.workDate === date);
            return (
              <section key={date} className={`availability-day ${dayOff ? "off" : ""}`} aria-label={`${label} ${formatHebrewDate(date)}`}>
                <header>
                  <strong>{label}</strong>
                  <span>{formatHebrewDate(date)}</span>
                  {scheduled.length > 0 ? <span className="badge accent" style={{ marginTop: 4, justifySelf: "start" }}>משובץ/ת</span> : null}
                </header>
                <div className="availability-shifts">
                  {dayOff ? (
                    <span className="muted">יום חופש</span>
                  ) : templates.length === 0 ? (
                    <span className="muted">אין משמרות ביום הזה</span>
                  ) : (
                    templates.map((template) => {
                      const entry = data.entries.find((item) => item.workDate === date && item.shiftTemplateId === template.id);
                      const status = entry?.status ?? "none";
                      const busy = saving === `${date}|${template.id}`;
                      return (
                        <button
                          key={template.id}
                          type="button"
                          className={`availability-toggle ${status}`}
                          disabled={past || busy}
                          aria-label={`${template.name} ${label}: ${status === "PREFERRED" ? "מעדיף/ה" : status === "UNAVAILABLE" ? "לא יכול/ה" : "זמין/ה"}. לחצו לשינוי`}
                          onClick={() => save(date, template.id, NEXT_STATUS[status] ?? null)}
                        >
                          <strong>
                            {status === "PREFERRED" ? <span className="status-icon good"><Star size={10} /></span> : null}
                            {status === "UNAVAILABLE" ? <span className="status-icon critical"><CircleSlash size={10} /></span> : null}
                            {template.name}
                          </strong>
                          <span className="ltr" style={{ textAlign: "right" }}>
                            {timeRangeLabel(template.startsAt, template.endsAt)}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
                <button
                  type="button"
                  className={dayOff ? "primary-button small" : "secondary-button small"}
                  disabled={past || saving === `${date}|null`}
                  aria-pressed={dayOff}
                  onClick={() => save(date, null, dayOff ? null : "TIME_OFF")}
                >
                  <Palmtree size={15} />
                  {dayOff ? "יום חופש ✓" : "יום חופש"}
                </button>
              </section>
            );
          })}
        </div>
      )}

      {data && data.templates.length > 0 ? (
        <div className="toolbar">
          <span className="spacer" />
          <button type="button" className="primary-button" onClick={submit}>
            <Check size={16} />
            {data.submitted ? "עדכנתי, סיימתי" : "סיימתי למלא"}
          </button>
        </div>
      ) : null}
      {toast}
    </AppShell>
  );
}
