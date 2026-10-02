"use client";

import { Archive, ArchiveRestore, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/client";
import { DAY_SHORT_LABELS } from "@/lib/labels";
import { runsOnWeekday, shiftHours, timeRangeLabel, weekdaysMask } from "@/lib/shiftTime";
import type { Department, ShiftTemplate, Team } from "@/lib/types";
import { AppShell, type ShellProps } from "../shell/AppShell";
import { TeamDot, teamColor } from "../ui/Avatar";
import { Dialog } from "../ui/Dialog";
import { useToast } from "../ui/useToast";

interface OrgData {
  departments: Department[];
  teams: Team[];
  shifts: ShiftTemplate[];
}

function weekdaysText(mask: number) {
  if (mask === 127) return "כל השבוע";
  if (mask === weekdaysMask([0, 1, 2, 3, 4])) return "א׳–ה׳";
  return DAY_SHORT_LABELS.filter((_, day) => runsOnWeekday(mask, day)).join(" ");
}

export function SettingsView(shell: ShellProps) {
  const [org, setOrg] = useState<OrgData | null>(null);
  const [configurable, setConfigurable] = useState<string[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<string>("");
  const [shiftDialog, setShiftDialog] = useState<ShiftTemplate | "new" | null>(null);
  const [teamDialog, setTeamDialog] = useState<{ team: Team | null; departmentId: string } | null>(null);
  const [departmentDialog, setDepartmentDialog] = useState<Department | "new" | null>(null);
  const { show, toast } = useToast();
  const isAdmin = shell.user.role === "ADMIN";

  const load = useCallback(async () => {
    const [orgResult, me] = await Promise.all([api<OrgData>("/api/org"), api<{ scopes: Record<string, string[]> }>("/api/me")]);
    if (orgResult.ok) setOrg(orgResult.data);
    if (me.ok) {
      const teamIds = me.data.scopes["shifts.configure"] ?? [];
      setConfigurable(teamIds);
      setSelectedTeam((current) => current || teamIds[0] || "");
    }
  }, []);

  useEffect(() => {
    // Initial fetch is intentionally synchronized here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const team = org?.teams.find((item) => item.id === selectedTeam) ?? null;
  const shifts = useMemo(
    () => (org?.shifts ?? []).filter((shift) => shift.teamId === selectedTeam).sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.sortOrder - b.sortOrder || a.startsAt.localeCompare(b.startsAt)),
    [org, selectedTeam]
  );
  const canManageTeamsIn = (departmentId: string) => isAdmin || (shell.user.role === "DEPARTMENT_MANAGER" && shell.user.departmentId === departmentId);

  async function run(path: string, method: string, body: unknown, done: string) {
    const result = await api(path, { method, body });
    if (!result.ok) {
      show(result.error ?? "הפעולה נכשלה.");
      return false;
    }
    show(done);
    await load();
    return true;
  }

  return (
    <AppShell {...shell} title="צוותים ומשמרות" subtitle="מבנה הארגון וסוגי המשמרות">
      {!org ? (
        <p className="empty-state">טוען...</p>
      ) : (
        <>
          {configurable.length > 0 ? (
            <section className="card">
              <div className="card-header">
                <div>
                  <h2>משמרות הצוות</h2>
                  <p>השעות וכמה אנשים צריך בכל משמרת. שינוי שעות לא משנה שיבוצים שכבר נקבעו.</p>
                </div>
                <div className="toolbar">
                  <select value={selectedTeam} onChange={(event) => setSelectedTeam(event.target.value)} aria-label="צוות" style={{ width: "auto", minWidth: 180 }}>
                    {org.teams
                      .filter((item) => configurable.includes(item.id))
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                  </select>
                  <button type="button" className="primary-button" onClick={() => setShiftDialog("new")} disabled={!team}>
                    <Plus size={16} />
                    משמרת חדשה
                  </button>
                </div>
              </div>
              <div className="shift-table">
                {shifts.length === 0 ? <p className="empty-state">אין משמרות לצוות הזה עדיין.</p> : null}
                {shifts.map((shift, index) => (
                  <div key={shift.id} className={`shift-row ${shift.isActive ? "" : "archived"}`}>
                    <div>
                      <strong style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <i className="team-dot" style={{ "--team": teamColor(Math.min(8, index + 1)) } as React.CSSProperties} aria-hidden="true" />
                        {shift.name}
                        {!shift.isActive ? <span className="badge">בארכיון</span> : null}
                      </strong>
                      <span>
                        <span className="ltr">{timeRangeLabel(shift.startsAt, shift.endsAt)}</span> · {shiftHours(shift.startsAt, shift.endsAt)} שעות · {weekdaysText(shift.weekdays)}
                      </span>
                    </div>
                    <span className="badge accent">{shift.requiredCount} אנשים</span>
                    <button type="button" className="icon-button" onClick={() => setShiftDialog(shift)} aria-label={`עריכת ${shift.name}`} title="עריכה">
                      <Pencil size={16} />
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => run(`/api/shifts/${shift.id}`, "PATCH", { isActive: !shift.isActive }, shift.isActive ? "המשמרת הועברה לארכיון." : "המשמרת הוחזרה.")}
                      aria-label={shift.isActive ? `העברת ${shift.name} לארכיון` : `החזרת ${shift.name}`}
                      title={shift.isActive ? "העברה לארכיון" : "החזרה"}
                    >
                      {shift.isActive ? <Archive size={16} /> : <ArchiveRestore size={16} />}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className="card">
            <div className="card-header">
              <div>
                <h2>מחלקות וצוותים</h2>
                <p>לכל צוות צבע קבוע שמופיע בכל הגרפים.</p>
              </div>
              {isAdmin ? (
                <button type="button" className="secondary-button" onClick={() => setDepartmentDialog("new")}>
                  <Plus size={16} />
                  מחלקה חדשה
                </button>
              ) : null}
            </div>
            <div className="grid-2">
              {org.departments
                .filter((department) => isAdmin || org.teams.some((item) => item.departmentId === department.id) || department.id === shell.user.departmentId)
                .map((department) => (
                  <div key={department.id} className="org-team card" style={{ boxShadow: "none" }}>
                    <div className="card-header" style={{ marginBottom: 0 }}>
                      <h2>{department.name}</h2>
                      <div className="toolbar">
                        {isAdmin ? (
                          <>
                            <button type="button" className="icon-button" onClick={() => setDepartmentDialog(department)} aria-label={`שינוי שם ${department.name}`} title="שינוי שם">
                              <Pencil size={16} />
                            </button>
                            <button type="button" className="icon-button" onClick={() => run(`/api/departments/${department.id}`, "DELETE", undefined, "המחלקה נמחקה.")} aria-label={`מחיקת ${department.name}`} title="מחיקה">
                              <Trash2 size={16} />
                            </button>
                          </>
                        ) : null}
                        {canManageTeamsIn(department.id) ? (
                          <button type="button" className="secondary-button small" onClick={() => setTeamDialog({ team: null, departmentId: department.id })}>
                            <Plus size={15} />
                            צוות
                          </button>
                        ) : null}
                      </div>
                    </div>
                    {org.teams
                      .filter((item) => item.departmentId === department.id)
                      .map((item) => (
                        <div key={item.id} className="shift-row" style={{ gridTemplateColumns: "minmax(0, 1fr) auto auto auto" }}>
                          <strong style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <TeamDot colorSlot={item.colorSlot} />
                            {item.name}
                          </strong>
                          <span className="badge">{org.shifts.filter((shift) => shift.teamId === item.id && shift.isActive).length} משמרות</span>
                          {canManageTeamsIn(department.id) ? (
                            <button type="button" className="icon-button" onClick={() => setTeamDialog({ team: item, departmentId: department.id })} aria-label={`עריכת ${item.name}`} title="עריכה">
                              <Pencil size={16} />
                            </button>
                          ) : (
                            <span />
                          )}
                          {isAdmin ? (
                            <button type="button" className="icon-button" onClick={() => run(`/api/teams/${item.id}`, "DELETE", undefined, "הצוות נמחק.")} aria-label={`מחיקת ${item.name}`} title="מחיקה">
                              <Trash2 size={16} />
                            </button>
                          ) : (
                            <span />
                          )}
                        </div>
                      ))}
                  </div>
                ))}
            </div>
          </section>
        </>
      )}

      {shiftDialog && team ? (
        <ShiftDialog
          shift={shiftDialog === "new" ? null : shiftDialog}
          team={team}
          nextSortOrder={shifts.length}
          onClose={() => setShiftDialog(null)}
          onSave={async (body) => {
            const ok =
              shiftDialog === "new"
                ? await run(`/api/teams/${team.id}/shifts`, "POST", body, "המשמרת נוספה.")
                : await run(`/api/shifts/${shiftDialog.id}`, "PATCH", body, "המשמרת עודכנה.");
            if (ok) setShiftDialog(null);
          }}
        />
      ) : null}

      {teamDialog ? (
        <TeamDialog
          team={teamDialog.team}
          onClose={() => setTeamDialog(null)}
          onSave={async (body) => {
            const ok = teamDialog.team
              ? await run(`/api/teams/${teamDialog.team.id}`, "PATCH", body, "הצוות עודכן.")
              : await run("/api/teams", "POST", { ...body, departmentId: teamDialog.departmentId }, "הצוות נוסף.");
            if (ok) setTeamDialog(null);
          }}
        />
      ) : null}

      {departmentDialog ? (
        <NameDialog
          title={departmentDialog === "new" ? "מחלקה חדשה" : "שינוי שם מחלקה"}
          initial={departmentDialog === "new" ? "" : departmentDialog.name}
          onClose={() => setDepartmentDialog(null)}
          onSave={async (name) => {
            const ok =
              departmentDialog === "new"
                ? await run("/api/departments", "POST", { name }, "המחלקה נוספה.")
                : await run(`/api/departments/${departmentDialog.id}`, "PATCH", { name }, "השם עודכן.");
            if (ok) setDepartmentDialog(null);
          }}
        />
      ) : null}
      {toast}
    </AppShell>
  );
}

function ShiftDialog({
  shift,
  team,
  nextSortOrder,
  onClose,
  onSave
}: {
  shift: ShiftTemplate | null;
  team: Team;
  nextSortOrder: number;
  onClose: () => void;
  onSave: (body: Record<string, unknown>) => void;
}) {
  const [name, setName] = useState(shift?.name ?? "");
  const [startsAt, setStartsAt] = useState(shift?.startsAt ?? "09:00");
  const [endsAt, setEndsAt] = useState(shift?.endsAt ?? "17:00");
  const [requiredCount, setRequiredCount] = useState(String(shift?.requiredCount ?? 2));
  const [weekdays, setWeekdays] = useState(shift?.weekdays ?? weekdaysMask([0, 1, 2, 3, 4]));
  const [sortOrder, setSortOrder] = useState(String(shift?.sortOrder ?? nextSortOrder));
  const overnight = startsAt && endsAt && endsAt <= startsAt;

  return (
    <Dialog title={shift ? `עריכת ${shift.name}` : "משמרת חדשה"} description={team.name} onClose={onClose}>
      <form
        className="form-grid"
        onSubmit={(event) => {
          event.preventDefault();
          onSave({ name, startsAt, endsAt, requiredCount: Number(requiredCount), weekdays, sortOrder: Number(sortOrder) });
        }}
      >
        <label className="full">
          שם המשמרת
          <input value={name} onChange={(event) => setName(event.target.value)} required maxLength={40} placeholder="למשל: בוקר" />
        </label>
        <label>
          התחלה
          <input type="time" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} required />
        </label>
        <label>
          סיום
          <input type="time" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} required />
        </label>
        {overnight ? <p className="hint full">המשמרת מסתיימת למחרת ({shiftHours(startsAt, endsAt)} שעות).</p> : null}
        <label>
          כמה אנשים צריך
          <input type="number" min={0} max={200} value={requiredCount} onChange={(event) => setRequiredCount(event.target.value)} required />
        </label>
        <label>
          סדר תצוגה
          <input type="number" value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} />
        </label>
        <div className="full" style={{ display: "grid", gap: 6 }}>
          <span style={{ color: "var(--ink-2)", fontSize: 13, fontWeight: 600 }}>ימים</span>
          <div className="weekday-picker" role="group" aria-label="ימים">
            {DAY_SHORT_LABELS.map((label, day) => (
              <button key={label} type="button" aria-pressed={runsOnWeekday(weekdays, day)} onClick={() => setWeekdays(weekdays ^ (1 << day))}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="dialog-actions full">
          <button type="button" className="secondary-button" onClick={onClose}>
            ביטול
          </button>
          <button type="submit" className="primary-button" disabled={weekdays === 0 || !name.trim()}>
            שמירה
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function TeamDialog({ team, onClose, onSave }: { team: Team | null; onClose: () => void; onSave: (body: Record<string, unknown>) => void }) {
  const [name, setName] = useState(team?.name ?? "");
  const [colorSlot, setColorSlot] = useState<number | null>(team?.colorSlot ?? null);
  return (
    <Dialog title={team ? `עריכת ${team.name}` : "צוות חדש"} onClose={onClose}>
      <form
        className="form-grid"
        onSubmit={(event) => {
          event.preventDefault();
          onSave(colorSlot ? { name, colorSlot } : { name });
        }}
      >
        <label className="full">
          שם הצוות
          <input value={name} onChange={(event) => setName(event.target.value)} required maxLength={60} />
        </label>
        <div className="full" style={{ display: "grid", gap: 6 }}>
          <span style={{ color: "var(--ink-2)", fontSize: 13, fontWeight: 600 }}>צבע בגרפים {team ? "" : "(ברירת מחדל: הצבע הפנוי הבא)"}</span>
          <div className="color-picker" role="group" aria-label="צבע">
            {Array.from({ length: 8 }, (_, index) => index + 1).map((slot) => (
              <button key={slot} type="button" aria-pressed={colorSlot === slot} aria-label={`צבע ${slot}`} style={{ background: teamColor(slot) }} onClick={() => setColorSlot(slot)} />
            ))}
          </div>
        </div>
        <div className="dialog-actions full">
          <button type="button" className="secondary-button" onClick={onClose}>
            ביטול
          </button>
          <button type="submit" className="primary-button" disabled={!name.trim()}>
            שמירה
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function NameDialog({ title, initial, onClose, onSave }: { title: string; initial: string; onClose: () => void; onSave: (name: string) => void }) {
  const [name, setName] = useState(initial);
  return (
    <Dialog title={title} onClose={onClose}>
      <form
        className="form-grid"
        onSubmit={(event) => {
          event.preventDefault();
          onSave(name);
        }}
      >
        <label className="full">
          שם
          <input value={name} onChange={(event) => setName(event.target.value)} required maxLength={60} />
        </label>
        <div className="dialog-actions full">
          <button type="button" className="secondary-button" onClick={onClose}>
            ביטול
          </button>
          <button type="submit" className="primary-button" disabled={!name.trim()}>
            שמירה
          </button>
        </div>
      </form>
    </Dialog>
  );
}
