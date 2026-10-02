"use client";

import {
  AlertTriangle,
  Check,
  CircleAlert,
  Download,
  Plus,
  Search,
  Send,
  Users,
  Wand2,
  X
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { api } from "@/lib/client";
import { addDays, formatHebrewDate } from "@/lib/dates";
import { DAY_LABELS, DAY_SHORT_LABELS } from "@/lib/labels";
import { buildScheduleCsv } from "@/lib/scheduleExport";
import { assignmentHours, availabilityFor, coverageTotals, validateAssignment, weekCoverage, type CoverageCell } from "@/lib/scheduling";
import { formatHours, runsOnWeekday, timeRangeLabel, weekdayOf } from "@/lib/shiftTime";
import type { Assignment, AvailabilityEntry, Issue, Role, ShiftTemplate, Team } from "@/lib/types";
import { Meter } from "../charts/StatTile";
import { AppShell, type ShellProps } from "../shell/AppShell";
import { Avatar, teamColor } from "../ui/Avatar";
import { Dialog } from "../ui/Dialog";
import { useToast } from "../ui/useToast";
import { WeekNav } from "../ui/WeekNav";

interface Member {
  id: string;
  name: string;
  role: Role;
  title: string;
  weeklyMinHours: number;
  weeklyMaxHours: number;
}

interface WeekData {
  weekStart: string;
  team: Team;
  templates: ShiftTemplate[];
  members: Member[];
  assignments: Assignment[];
  otherAssignments: Assignment[];
  availability: AvailabilityEntry[];
  vacations: { userId: string; startDate: string; endDate: string }[];
  publishedAt: string | null;
  canEdit: boolean;
  canPublish: boolean;
}

type Slot = { template: ShiftTemplate; workDate: string };

const publishedFormat = new Intl.DateTimeFormat("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

function templateSlot(templates: ShiftTemplate[], id: string) {
  return Math.min(8, templates.findIndex((template) => template.id === id) + 1) || 1;
}

function CoverageBadge({ cell }: { cell: CoverageCell }) {
  if (cell.status === "closed") {
    return null;
  }
  const text = `${cell.assigned}/${cell.required}`;
  if (cell.status === "full") {
    return (
      <span className="badge good" title="מאויש">
        <Check size={12} aria-hidden="true" />
        {text}
      </span>
    );
  }
  if (cell.status === "over") {
    return (
      <span className="badge accent" title="יותר מהנדרש">
        <Plus size={12} aria-hidden="true" />
        {text}
      </span>
    );
  }
  return (
    <span className={`badge ${cell.status === "empty" ? "critical" : "warning"}`} title={`חסרים ${cell.required - cell.assigned}`}>
      <CircleAlert size={12} aria-hidden="true" />
      {text}
    </span>
  );
}

export function ScheduleView({
  initialWeek,
  initialTeamId,
  thisWeek,
  today,
  teams,
  ...shell
}: ShellProps & { initialWeek: string; initialTeamId: string | null; thisWeek: string; today: string; teams: Team[] }) {
  const router = useRouter();
  const [weekStart, setWeekStart] = useState(initialWeek);
  const [teamId, setTeamId] = useState(initialTeamId ?? shell.user.teamId ?? teams[0]?.id ?? null);
  const [data, setData] = useState<WeekData | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"shifts" | "people">("shifts");
  const [mobileDay, setMobileDay] = useState(0);
  const [picker, setPicker] = useState<Slot | null>(null);
  const [personDay, setPersonDay] = useState<{ member: Member; workDate: string } | null>(null);
  const [pendingWarnings, setPendingWarnings] = useState<{ userId: string; slot: Slot; warnings: Issue[] } | null>(null);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const { show, toast } = useToast();

  const load = useCallback(async () => {
    if (!teamId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const result = await api<WeekData>(`/api/schedule?week=${weekStart}&team=${teamId}`);
    setLoading(false);
    if (result.ok) {
      setData(result.data);
    } else {
      show(result.error ?? "טעינת הסידור נכשלה.");
    }
  }, [teamId, weekStart, show]);

  useEffect(() => {
    // Fetching on week/team change is intentionally synchronized here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    router.replace(`/schedule?week=${weekStart}${teamId ? `&team=${teamId}` : ""}`, { scroll: false });
  }, [load, router, weekStart, teamId]);

  useEffect(() => {
    const todayIndex = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${weekStart}T00:00:00Z`)) / 86400000);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMobileDay(todayIndex >= 0 && todayIndex < 7 ? todayIndex : 0);
  }, [today, weekStart]);

  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);
  const names = useMemo(() => new Map((data?.members ?? []).map((member) => [member.id, member.name])), [data]);
  const activeTemplates = useMemo(() => (data?.templates ?? []).filter((template) => template.isActive || data?.assignments.some((assignment) => assignment.shiftTemplateId === template.id)), [data]);
  const cells = useMemo(() => (data ? weekCoverage(weekStart, activeTemplates, data.assignments) : []), [data, weekStart, activeTemplates]);
  const totals = useMemo(() => coverageTotals(cells), [cells]);
  const cellFor = (templateId: string, workDate: string) => cells.find((cell) => cell.templateId === templateId && cell.workDate === workDate);
  const hoursByMember = useMemo(() => {
    const hours = new Map<string, number>();
    for (const assignment of data?.assignments ?? []) {
      hours.set(assignment.userId, (hours.get(assignment.userId) ?? 0) + assignmentHours(assignment));
    }
    for (const assignment of data?.otherAssignments ?? []) {
      if (assignment.workDate >= weekStart && assignment.workDate < addDays(weekStart, 7)) {
        hours.set(assignment.userId, (hours.get(assignment.userId) ?? 0) + assignmentHours(assignment));
      }
    }
    return hours;
  }, [data, weekStart]);

  const onVacation = (userId: string, date: string) =>
    data?.vacations.some((vacation) => vacation.userId === userId && vacation.startDate <= date && vacation.endDate >= date) ?? false;

  async function assign(userId: string, slot: Slot, acknowledgeWarnings = false) {
    setBusy(true);
    const result = await api("/api/assignments", {
      method: "POST",
      body: { userId, shiftTemplateId: slot.template.id, workDate: slot.workDate, acknowledgeWarnings }
    });
    setBusy(false);
    if (result.status === 409 && result.details?.warnings?.length) {
      setPendingWarnings({ userId, slot, warnings: result.details.warnings });
      return;
    }
    if (!result.ok) {
      show(result.error ?? "השיבוץ נכשל.");
      return;
    }
    setPendingWarnings(null);
    show(`${names.get(userId)} שובץ/ה ל${slot.template.name} ${formatHebrewDate(slot.workDate)}.`);
    await load();
  }

  async function unassign(assignment: Assignment) {
    setBusy(true);
    const result = await api(`/api/assignments/${assignment.id}`, { method: "DELETE" });
    setBusy(false);
    if (!result.ok) {
      show(result.error ?? "ההסרה נכשלה.");
      return;
    }
    show(`${names.get(assignment.userId)} הוסר/ה מהמשמרת.`);
    await load();
  }

  async function autoFill() {
    if (!data) return;
    setBusy(true);
    const result = await api<{ created: number; unfilled: { missing: number }[] }>("/api/schedule/generate", {
      method: "POST",
      body: { teamId: data.team.id, weekStart }
    });
    setBusy(false);
    if (!result.ok) {
      show(result.error ?? "המילוי האוטומטי נכשל.");
      return;
    }
    const missing = result.data.unfilled.reduce((sum, item) => sum + item.missing, 0);
    show(
      `${result.data.created > 0 ? `נוספו ${result.data.created} שיבוצים.` : "לא נמצאו מקומות פנויים למילוי."}${missing > 0 ? ` ${missing} מקומות נשארו פתוחים (אין עובדים זמינים).` : ""}`
    );
    await load();
  }

  async function publish() {
    if (!data) return;
    setBusy(true);
    const result = await api<{ wasPublished: boolean; notified: number }>("/api/schedule/publish", {
      method: "POST",
      body: { teamId: data.team.id, weekStart }
    });
    setBusy(false);
    setConfirmPublish(false);
    if (!result.ok) {
      show(result.error ?? "הפרסום נכשל.");
      return;
    }
    show(result.data.wasPublished ? `נשלח עדכון ל-${result.data.notified} אנשי צוות.` : `הסידור פורסם ונשלחה התראה ל-${result.data.notified} אנשי צוות.`);
    await load();
  }

  function exportCsv() {
    if (!data) return;
    const blob = new Blob([buildScheduleCsv(data.assignments, data.templates, names)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${data.team.name}-${weekStart}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const filteredMembers = (data?.members ?? []).filter((member) => member.name.includes(search.trim()));
  const team = data?.team;

  const toolbar = (
    <div className="toolbar">
      {teams.length > 1 ? (
        <select value={teamId ?? ""} onChange={(event) => setTeamId(event.target.value)} aria-label="צוות" style={{ width: "auto", minWidth: 180 }}>
          {teams.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
      ) : null}
      <WeekNav weekStart={weekStart} onChange={setWeekStart} thisWeek={thisWeek} />
      <div className="segmented" role="group" aria-label="תצוגה">
        <button type="button" aria-pressed={view === "shifts"} onClick={() => setView("shifts")}>
          לפי משמרות
        </button>
        <button type="button" aria-pressed={view === "people"} onClick={() => setView("people")}>
          <Users size={15} />
          לפי עובדים
        </button>
      </div>
      <span className="spacer" />
      {data?.canEdit ? (
        <button type="button" className="secondary-button" onClick={autoFill} disabled={busy}>
          <Wand2 size={16} />
          מילוי אוטומטי
        </button>
      ) : null}
      <button type="button" className="secondary-button" onClick={exportCsv} disabled={!data} title="ייצוא ל-CSV">
        <Download size={16} />
        <span className="desktop-only" style={{ display: "inline" }}>
          ייצוא
        </span>
      </button>
      {data?.canPublish ? (
        <button type="button" className="primary-button" onClick={() => setConfirmPublish(true)} disabled={busy}>
          <Send size={16} />
          {data.publishedAt ? "שליחת עדכון" : "פרסום השבוע"}
        </button>
      ) : null}
    </div>
  );

  return (
    <AppShell {...shell} title="סידור עבודה" subtitle={team ? team.name : undefined}>
      {toolbar}

      {!teamId ? (
        <p className="empty-state">אין צוות להצגה.</p>
      ) : !data ? (
        <p className="empty-state">{loading ? "טוען..." : "לא נמצא סידור."}</p>
      ) : (
        <div style={{ opacity: loading ? 0.6 : 1, transition: "opacity 120ms", display: "grid", gap: 16 }}>
          <div className="toolbar" aria-live="polite">
            <span className={`badge ${totals.percent >= 100 ? "good" : totals.percent >= 85 ? "warning" : "critical"}`}>
              {totals.percent >= 100 ? <Check size={12} aria-hidden="true" /> : <CircleAlert size={12} aria-hidden="true" />}
              איוש {totals.percent}%
            </span>
            <span className="badge">
              {totals.filled}/{totals.required} מקומות מאוישים
            </span>
            {totals.openSlots > 0 ? <span className="badge warning">{totals.openSlots} מקומות פתוחים</span> : null}
            {data.publishedAt ? (
              <span className="badge good">
                <Check size={12} aria-hidden="true" />
                פורסם {publishedFormat.format(new Date(data.publishedAt))}
              </span>
            ) : (
              <span className="badge">טרם פורסם</span>
            )}
          </div>

          {activeTemplates.length === 0 ? (
            <div className="card">
              <p className="empty-state">לצוות הזה עוד אין משמרות. אפשר להגדיר אותן במסך &quot;צוותים ומשמרות&quot;.</p>
            </div>
          ) : view === "shifts" ? (
            <>
              <div className="planner desktop-only">
                <div className="planner-grid" role="table" aria-label="סידור לפי משמרות">
                  <div className="planner-head" role="columnheader">
                    משמרת
                  </div>
                  {days.map((date, index) => (
                    <div key={date} className={`planner-head ${date === today ? "today" : ""}`} role="columnheader">
                      {DAY_LABELS[index]}
                      <span>{formatHebrewDate(date)}</span>
                    </div>
                  ))}
                  {activeTemplates.map((template) => (
                    <div key={template.id} role="row" style={{ display: "contents" }}>
                      <div className="planner-rowhead" role="rowheader">
                        <strong>
                          <i className="team-dot" style={{ "--team": teamColor(templateSlot(activeTemplates, template.id)) } as CSSProperties} aria-hidden="true" />
                          {template.name}
                        </strong>
                        <span className="ltr" style={{ textAlign: "right" }}>
                          {timeRangeLabel(template.startsAt, template.endsAt)}
                        </span>
                        <span>נדרשים {template.requiredCount}</span>
                      </div>
                      {days.map((date) => {
                        const cell = cellFor(template.id, date);
                        const people = data.assignments.filter((assignment) => assignment.shiftTemplateId === template.id && assignment.workDate === date);
                        const runs = template.isActive && runsOnWeekday(template.weekdays, weekdayOf(date));
                        if (!runs && people.length === 0) {
                          return (
                            <div key={date} className="planner-cell closed" role="cell">
                              לא פעילה
                            </div>
                          );
                        }
                        const content = (
                          <>
                            <div className="cell-coverage">{cell ? <CoverageBadge cell={cell} /> : null}</div>
                            <div className="cell-names">
                              {people.map((assignment) => (
                                <span key={assignment.id} className="chip">
                                  {names.get(assignment.userId) ?? "—"}
                                </span>
                              ))}
                            </div>
                          </>
                        );
                        return data.canEdit ? (
                          <button
                            key={date}
                            type="button"
                            className="planner-cell"
                            role="cell"
                            onClick={() => setPicker({ template, workDate: date })}
                            aria-label={`${template.name} ${formatHebrewDate(date)}: ${people.length} מתוך ${template.requiredCount}. לחצו לשיבוץ`}
                          >
                            {content}
                          </button>
                        ) : (
                          <div key={date} className="planner-cell" role="cell">
                            {content}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>

              <div className="mobile-only">
                <div className="day-tabs" role="group" aria-label="יום">
                  {days.map((date, index) => {
                    const dayCells = cells.filter((cell) => cell.workDate === date);
                    const missing = dayCells.some((cell) => cell.assigned < cell.required);
                    return (
                      <button key={date} type="button" aria-pressed={mobileDay === index} onClick={() => setMobileDay(index)} aria-label={`${DAY_LABELS[index]} ${formatHebrewDate(date)}`}>
                        {DAY_SHORT_LABELS[index]}
                        <span>{formatHebrewDate(date).slice(0, 2)}</span>
                        {missing ? <i aria-label="יש מקומות פתוחים" /> : null}
                      </button>
                    );
                  })}
                </div>
                <div className="mobile-shifts" style={{ marginTop: 12 }}>
                  {activeTemplates
                    .filter((template) => {
                      const date = days[mobileDay];
                      return (template.isActive && runsOnWeekday(template.weekdays, weekdayOf(date))) || data.assignments.some((assignment) => assignment.shiftTemplateId === template.id && assignment.workDate === date);
                    })
                    .map((template) => {
                      const date = days[mobileDay];
                      const cell = cellFor(template.id, date);
                      const people = data.assignments.filter((assignment) => assignment.shiftTemplateId === template.id && assignment.workDate === date);
                      return (
                        <section key={template.id} className="card" style={{ display: "grid", gap: 10 }}>
                          <div className="card-header" style={{ marginBottom: 0 }}>
                            <div>
                              <h2>{template.name}</h2>
                              <p className="ltr" style={{ textAlign: "right" }}>
                                {timeRangeLabel(template.startsAt, template.endsAt)}
                              </p>
                            </div>
                            {cell ? <CoverageBadge cell={cell} /> : null}
                          </div>
                          <div className="cell-names">
                            {people.length === 0 ? <span className="muted">אין שיבוצים</span> : null}
                            {people.map((assignment) => (
                              <span key={assignment.id} className="chip">
                                {names.get(assignment.userId) ?? "—"}
                              </span>
                            ))}
                          </div>
                          {data.canEdit ? (
                            <button type="button" className="secondary-button small" onClick={() => setPicker({ template, workDate: date })}>
                              <Plus size={15} />
                              שיבוץ
                            </button>
                          ) : null}
                        </section>
                      );
                    })}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="toolbar">
                <label className="search-input" style={{ display: "block" }}>
                  <span className="sr-only">חיפוש עובד/ת</span>
                  <Search size={16} aria-hidden="true" />
                  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="חיפוש לפי שם" />
                </label>
                <span className="muted">{filteredMembers.length} אנשים</span>
              </div>
              <div className="planner">
                <div className="planner-grid people" role="table" aria-label="סידור לפי עובדים">
                  <div className="planner-head" role="columnheader">
                    עובד/ת
                  </div>
                  {days.map((date, index) => (
                    <div key={date} className={`planner-head ${date === today ? "today" : ""}`} role="columnheader">
                      {DAY_LABELS[index]}
                      <span>{formatHebrewDate(date)}</span>
                    </div>
                  ))}
                  <div className="planner-head" role="columnheader">
                    שעות
                  </div>
                  {filteredMembers.map((member) => {
                    const hours = hoursByMember.get(member.id) ?? 0;
                    return (
                      <div key={member.id} role="row" style={{ display: "contents" }}>
                        <div className="planner-rowhead" role="rowheader">
                          <strong>
                            <Avatar name={member.name} colorSlot={team?.colorSlot} size="sm" />
                            {member.name}
                          </strong>
                          <span>{member.role === "TEAM_LEAD" ? "ראש צוות" : member.title}</span>
                        </div>
                        {days.map((date) => {
                          const own = data.assignments.filter((assignment) => assignment.userId === member.id && assignment.workDate === date);
                          const elsewhere = data.otherAssignments.filter((assignment) => assignment.userId === member.id && assignment.workDate === date);
                          const entry = data.availability.find((item) => item.userId === member.id && item.workDate === date && item.shiftTemplateId === null);
                          const vacation = onVacation(member.id, date);
                          const content = (
                            <>
                              {own.map((assignment) => {
                                const template = data.templates.find((item) => item.id === assignment.shiftTemplateId);
                                return (
                                  <span key={assignment.id} className="shift-chip" style={{ "--shift": teamColor(templateSlot(activeTemplates, assignment.shiftTemplateId)) } as CSSProperties}>
                                    {template?.name}
                                    <span className="ltr">{timeRangeLabel(assignment.startsAt, assignment.endsAt)}</span>
                                  </span>
                                );
                              })}
                              {elsewhere.map((assignment) => (
                                <span key={assignment.id} className="shift-chip" style={{ "--shift": "var(--line-strong)" } as CSSProperties}>
                                  צוות אחר
                                  <span className="ltr">{timeRangeLabel(assignment.startsAt, assignment.endsAt)}</span>
                                </span>
                              ))}
                              {own.length === 0 && elsewhere.length === 0 ? (
                                vacation || entry?.status === "TIME_OFF" ? (
                                  <span className="badge">חופש</span>
                                ) : entry?.status === "UNAVAILABLE" ? (
                                  <span className="badge critical">לא זמין/ה</span>
                                ) : (
                                  <span className="muted" style={{ fontSize: 12 }}>
                                    —
                                  </span>
                                )
                              ) : null}
                            </>
                          );
                          return data.canEdit ? (
                            <button key={date} type="button" className="planner-cell" role="cell" style={{ minHeight: 64 }} onClick={() => setPersonDay({ member, workDate: date })} aria-label={`${member.name} ${formatHebrewDate(date)}`}>
                              {content}
                            </button>
                          ) : (
                            <div key={date} className="planner-cell" role="cell" style={{ minHeight: 64 }}>
                              {content}
                            </div>
                          );
                        })}
                        <div className="planner-cell" role="cell" style={{ minHeight: 64 }}>
                          <strong className="tabular">{formatHours(hours)}</strong>
                          {member.weeklyMaxHours > 0 ? (
                            <Meter
                              value={hours}
                              max={member.weeklyMaxHours}
                              tone={hours > member.weeklyMaxHours ? "critical" : hours < member.weeklyMinHours ? "warning" : undefined}
                              label={`${formatHours(hours)} מתוך ${member.weeklyMaxHours} שעות`}
                            />
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {picker && data ? (
        <ShiftPicker
          slot={picker}
          data={data}
          weekStart={weekStart}
          busy={busy}
          onAssign={(userId) => assign(userId, picker)}
          onUnassign={unassign}
          onClose={() => setPicker(null)}
        />
      ) : null}

      {personDay && data ? (
        <Dialog title={personDay.member.name} description={`${DAY_LABELS[weekdayOf(personDay.workDate)]} ${formatHebrewDate(personDay.workDate)}`} onClose={() => setPersonDay(null)}>
          <div className="permission-list">
            {activeTemplates
              .filter((template) => template.isActive && runsOnWeekday(template.weekdays, weekdayOf(personDay.workDate)))
              .map((template) => {
                const assigned = data.assignments.find((assignment) => assignment.userId === personDay.member.id && assignment.shiftTemplateId === template.id && assignment.workDate === personDay.workDate);
                return (
                  <div key={template.id} className="permission-item">
                    <i className="team-dot" style={{ "--team": teamColor(templateSlot(activeTemplates, template.id)) } as CSSProperties} />
                    <span>
                      {template.name}
                      <small className="ltr" style={{ textAlign: "right" }}>
                        {timeRangeLabel(template.startsAt, template.endsAt)}
                      </small>
                    </span>
                    {assigned ? (
                      <button type="button" className="danger-button small" disabled={busy} onClick={() => unassign(assigned).then(() => setPersonDay(null))}>
                        הסרה
                      </button>
                    ) : (
                      <button type="button" className="secondary-button small" disabled={busy} onClick={() => assign(personDay.member.id, { template, workDate: personDay.workDate }).then(() => setPersonDay(null))}>
                        שיבוץ
                      </button>
                    )}
                  </div>
                );
              })}
          </div>
        </Dialog>
      ) : null}

      {pendingWarnings ? (
        <Dialog title="לשבץ בכל זאת?" description={`${names.get(pendingWarnings.userId)} · ${pendingWarnings.slot.template.name} ${formatHebrewDate(pendingWarnings.slot.workDate)}`} onClose={() => setPendingWarnings(null)}>
          <ul className="issue-list">
            {pendingWarnings.warnings.map((warning) => (
              <li key={warning.code}>
                <AlertTriangle size={16} style={{ color: "var(--warning-text)", flex: "none", marginTop: 2 }} aria-hidden="true" />
                {warning.message}
              </li>
            ))}
          </ul>
          <div className="dialog-actions">
            <button type="button" className="secondary-button" onClick={() => setPendingWarnings(null)}>
              ביטול
            </button>
            <button type="button" className="primary-button" disabled={busy} onClick={() => assign(pendingWarnings.userId, pendingWarnings.slot, true)}>
              שיבוץ בכל זאת
            </button>
          </div>
        </Dialog>
      ) : null}

      {confirmPublish && data ? (
        <Dialog
          title={data.publishedAt ? "שליחת עדכון על הסידור" : "פרסום הסידור"}
          description={`${data.team.name} · ${formatHebrewDate(weekStart)}–${formatHebrewDate(addDays(weekStart, 6))}`}
          onClose={() => setConfirmPublish(false)}
        >
          <p style={{ margin: 0 }}>
            {data.publishedAt
              ? "כל אנשי הצוות יקבלו התראה שהסידור עודכן, עם המשמרות שלהם לשבוע זה."
              : "כל אנשי הצוות יקבלו התראה (באפליקציה ובטלפון) שהסידור מוכן, עם המשמרות שלהם לשבוע זה."}
          </p>
          {totals.openSlots > 0 ? (
            <ul className="issue-list" style={{ marginTop: 12 }}>
              <li>
                <AlertTriangle size={16} style={{ color: "var(--warning-text)", flex: "none", marginTop: 2 }} aria-hidden="true" />
                {totals.openSlots} מקומות עדיין לא מאוישים ({totals.understaffedShifts} משמרות).
              </li>
            </ul>
          ) : null}
          <div className="dialog-actions">
            <button type="button" className="secondary-button" onClick={() => setConfirmPublish(false)}>
              ביטול
            </button>
            <button type="button" className="primary-button" disabled={busy} onClick={publish}>
              <Send size={16} />
              {busy ? "שולח..." : data.publishedAt ? "שליחת עדכון" : "פרסום ושליחה"}
            </button>
          </div>
        </Dialog>
      ) : null}
      {toast}
    </AppShell>
  );
}

function ShiftPicker({
  slot,
  data,
  weekStart,
  busy,
  onAssign,
  onUnassign,
  onClose
}: {
  slot: Slot;
  data: WeekData;
  weekStart: string;
  busy: boolean;
  onAssign: (userId: string) => void;
  onUnassign: (assignment: Assignment) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const { template, workDate } = slot;
  const assigned = data.assignments.filter((assignment) => assignment.shiftTemplateId === template.id && assignment.workDate === workDate);
  const assignedIds = new Set(assigned.map((assignment) => assignment.userId));
  const allShifts = [...data.assignments, ...data.otherAssignments];
  const hours = (userId: string) =>
    allShifts
      .filter((assignment) => assignment.userId === userId && assignment.workDate >= weekStart && assignment.workDate < addDays(weekStart, 7))
      .reduce((sum, assignment) => sum + assignmentHours(assignment), 0);

  const candidates = data.members
    .filter((member) => !assignedIds.has(member.id) && member.name.includes(query.trim()))
    .map((member) => {
      const validation = validateAssignment(
        { userId: member.id, template, workDate },
        { ...member, isActive: true },
        allShifts,
        data.availability,
        weekStart
      );
      const preference = availabilityFor(data.availability, member.id, workDate, template.id).shift?.status === "PREFERRED";
      const rank = validation.errors.length > 0 ? 3 : validation.warnings.length > 0 ? 2 : preference ? 0 : 1;
      return { member, validation, preference, rank, hours: hours(member.id) };
    })
    .sort((left, right) => left.rank - right.rank || left.hours - right.hours || left.member.name.localeCompare(right.member.name, "he"));

  const groups: { title: string; items: typeof candidates }[] = [
    { title: "מעדיפים את המשמרת", items: candidates.filter((item) => item.rank === 0) },
    { title: "זמינים", items: candidates.filter((item) => item.rank === 1) },
    { title: "דורש אישור", items: candidates.filter((item) => item.rank === 2) },
    { title: "לא ניתן לשבץ", items: candidates.filter((item) => item.rank === 3) }
  ];

  return (
    <div className="panel-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="side-panel" role="dialog" aria-modal="true" aria-label={`שיבוץ ל${template.name}`}>
        <div className="side-panel-header">
          <div>
            <h2>
              {template.name} · {DAY_LABELS[weekdayOf(workDate)]} {formatHebrewDate(workDate)}
            </h2>
            <p>
              <span className="ltr">{timeRangeLabel(template.startsAt, template.endsAt)}</span> · משובצים {assigned.length} מתוך {template.requiredCount}
            </p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="סגירה">
            <X size={18} />
          </button>
        </div>
        <div className="side-panel-tools">
          {assigned.length > 0 ? (
            <div className="cell-names">
              {assigned.map((assignment) => (
                <span key={assignment.id} className="chip">
                  {data.members.find((member) => member.id === assignment.userId)?.name ?? "—"}
                  <button type="button" disabled={busy} onClick={() => onUnassign(assignment)} aria-label="הסרה מהמשמרת" title="הסרה">
                    <X size={13} />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          <label className="search-input" style={{ display: "block" }}>
            <span className="sr-only">חיפוש</span>
            <Search size={16} aria-hidden="true" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="חיפוש עובד/ת" autoFocus />
          </label>
        </div>
        <div className="side-panel-body">
          {groups.map((group) =>
            group.items.length === 0 ? null : (
              <div key={group.title}>
                <p className="picker-section">
                  {group.title} ({group.items.length})
                </p>
                {group.items.map(({ member, validation, hours: memberHours, preference }) => {
                  const reason = validation.errors[0]?.message ?? validation.warnings[0]?.message;
                  return (
                    <button
                      key={member.id}
                      type="button"
                      className="picker-row"
                      disabled={busy || validation.errors.length > 0}
                      onClick={() => onAssign(member.id)}
                    >
                      <Avatar name={member.name} colorSlot={data.team.colorSlot} size="sm" />
                      <div>
                        <strong>{member.name}</strong>
                        {reason ? (
                          <span className="picker-reason" style={{ color: validation.errors.length ? "var(--critical-text)" : "var(--warning-text)" }}>
                            {reason}
                          </span>
                        ) : (
                          <span>{preference ? "ביקש/ה את המשמרת הזו" : member.title}</span>
                        )}
                      </div>
                      <span className="badge tabular">
                        {formatHours(memberHours)}/{member.weeklyMaxHours} ש׳
                      </span>
                    </button>
                  );
                })}
              </div>
            )
          )}
        </div>
      </aside>
    </div>
  );
}
