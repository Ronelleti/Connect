"use client";

import { Pencil, Search, ShieldCheck, UserPlus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/client";
import { belongsToTeam, PERMISSION_LABELS, PERMISSIONS, ROLE_DEFAULTS, ROLE_LABELS, seesEverything, type Permission, type Role } from "@/lib/permissions";
import type { Department, Person, Team } from "@/lib/types";
import { AppShell, type ShellProps } from "../shell/AppShell";
import { Avatar, TeamDot } from "../ui/Avatar";
import { Dialog } from "../ui/Dialog";
import { useToast } from "../ui/useToast";

type ListedPerson = Person & { canManage: boolean };

interface PeopleData {
  people: ListedPerson[];
  assignableRoles: Role[];
  manageableTeamIds: string[];
  canEditPermissions: boolean;
}

const ROLE_TONE: Record<Role, string> = {
  ADMIN: "critical",
  SENIOR_MANAGER: "critical",
  DEPARTMENT_MANAGER: "accent",
  TEAM_LEAD: "warning",
  EXPERT: "good",
  EMPLOYEE: ""
};

export function PeopleView(shell: ShellProps) {
  const [data, setData] = useState<PeopleData | null>(null);
  const [org, setOrg] = useState<{ departments: Department[]; teams: Team[] }>({ departments: [], teams: [] });
  const [teamFilter, setTeamFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<ListedPerson | "new" | null>(null);
  const { show, toast } = useToast();

  const load = useCallback(async () => {
    const [people, orgResult] = await Promise.all([
      api<PeopleData>(`/api/people${showInactive ? "?inactive=1" : ""}`),
      api<{ departments: Department[]; teams: Team[] }>("/api/org")
    ]);
    if (people.ok) setData(people.data);
    if (orgResult.ok) setOrg({ departments: orgResult.data.departments, teams: orgResult.data.teams });
  }, [showInactive]);

  useEffect(() => {
    // Fetching on filter change is intentionally synchronized here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const teamById = useMemo(() => new Map(org.teams.map((team) => [team.id, team])), [org.teams]);
  const departmentById = useMemo(() => new Map(org.departments.map((department) => [department.id, department])), [org.departments]);
  const people = (data?.people ?? []).filter(
    (person) =>
      (teamFilter === "all" || person.teamId === teamFilter || (teamFilter === "none" && !person.teamId)) &&
      (person.name.includes(search.trim()) || person.email.includes(search.trim().toLowerCase()))
  );
  const canAdd = (data?.assignableRoles.length ?? 0) > 0 && ((data?.manageableTeamIds.length ?? 0) > 0 || seesEverything(shell.user.role) || shell.user.role === "DEPARTMENT_MANAGER");
  const counts = new Map<string, number>();
  for (const person of data?.people ?? []) {
    counts.set(person.teamId ?? "none", (counts.get(person.teamId ?? "none") ?? 0) + 1);
  }

  return (
    <AppShell {...shell} title="אנשים" subtitle={data ? `${data.people.length} אנשים` : undefined}>
      <div className="toolbar">
        <label className="search-input" style={{ display: "block" }}>
          <span className="sr-only">חיפוש</span>
          <Search size={16} aria-hidden="true" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="חיפוש לפי שם או אימייל" />
        </label>
        {data && data.people.some((person) => person.canManage) ? (
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600 }}>
            <input type="checkbox" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} />
            כולל לא פעילים
          </label>
        ) : null}
        <span className="spacer" />
        {canAdd ? (
          <button type="button" className="primary-button" onClick={() => setEditing("new")}>
            <UserPlus size={16} />
            הוספת עובד/ת
          </button>
        ) : null}
      </div>

      <div className="filter-chips" role="group" aria-label="סינון לפי צוות">
        <button type="button" aria-pressed={teamFilter === "all"} onClick={() => setTeamFilter("all")}>
          הכול <span className="muted">{data?.people.length ?? 0}</span>
        </button>
        {org.teams
          .filter((team) => counts.has(team.id))
          .map((team) => (
            <button key={team.id} type="button" aria-pressed={teamFilter === team.id} onClick={() => setTeamFilter(team.id)}>
              <TeamDot colorSlot={team.colorSlot} />
              {team.name} <span className="muted">{counts.get(team.id)}</span>
            </button>
          ))}
        {counts.has("none") ? (
          <button type="button" aria-pressed={teamFilter === "none"} onClick={() => setTeamFilter("none")}>
            הנהלה <span className="muted">{counts.get("none")}</span>
          </button>
        ) : null}
      </div>

      {!data ? (
        <p className="empty-state">טוען...</p>
      ) : people.length === 0 ? (
        <p className="empty-state">לא נמצאו אנשים.</p>
      ) : (
        <div className="people-list">
          {people.map((person) => {
            const team = person.teamId ? teamById.get(person.teamId) : null;
            const department = person.departmentId ? departmentById.get(person.departmentId) : null;
            return (
              <div key={person.id} className={`person-row ${person.isActive ? "" : "inactive"}`}>
                <Avatar name={person.name} colorSlot={team?.colorSlot} />
                <div>
                  <strong>
                    {person.name}
                    {person.extraPermissions.length > 0 ? (
                      <ShieldCheck size={14} style={{ color: "var(--accent)", marginInlineStart: 6, verticalAlign: "middle" }} aria-label="יש הרשאות נוספות" />
                    ) : null}
                  </strong>
                  <span>{[person.title, person.email].filter(Boolean).join(" · ")}</span>
                </div>
                <div className="hide-sm">
                  <span style={{ color: "var(--ink)", fontWeight: 600 }}>{team?.name ?? department?.name ?? "כל המערכת"}</span>
                  {person.canManage ? <span>{person.weeklyMinHours}–{person.weeklyMaxHours} שעות בשבוע</span> : null}
                </div>
                <span className={`badge ${ROLE_TONE[person.role]} hide-sm`}>{ROLE_LABELS[person.role]}</span>
                {person.canManage ? (
                  <button type="button" className="icon-button" onClick={() => setEditing(person)} aria-label={`עריכת ${person.name}`} title="עריכה">
                    <Pencil size={16} />
                  </button>
                ) : (
                  <span />
                )}
              </div>
            );
          })}
        </div>
      )}

      {editing && data ? (
        <PersonDialog
          person={editing === "new" ? null : editing}
          data={data}
          departments={org.departments}
          teams={org.teams}
          actorRole={shell.user.role}
          actorDepartmentId={shell.user.departmentId}
          onClose={() => setEditing(null)}
          onSaved={(message) => {
            setEditing(null);
            show(message);
            void load();
          }}
        />
      ) : null}
      {toast}
    </AppShell>
  );
}

function PersonDialog({
  person,
  data,
  departments,
  teams,
  actorRole,
  actorDepartmentId,
  onClose,
  onSaved
}: {
  person: ListedPerson | null;
  data: PeopleData;
  departments: Department[];
  teams: Team[];
  actorRole: Role;
  actorDepartmentId: string | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const roles = data.assignableRoles.includes(person?.role ?? "EMPLOYEE") || !person ? data.assignableRoles : [person.role, ...data.assignableRoles];
  const manageableTeams = seesEverything(actorRole) ? teams : teams.filter((team) => data.manageableTeamIds.includes(team.id));
  const [form, setForm] = useState({
    name: person?.name ?? "",
    email: person?.email ?? "",
    role: (person?.role ?? (roles.includes("EMPLOYEE") ? "EMPLOYEE" : roles[0])) as Role,
    teamId: person?.teamId ?? manageableTeams[0]?.id ?? "",
    departmentId: person?.departmentId ?? actorDepartmentId ?? departments[0]?.id ?? "",
    title: person?.title ?? "",
    weeklyMinHours: String(person?.weeklyMinHours ?? 24),
    weeklyMaxHours: String(person?.weeklyMaxHours ?? 42),
    password: "",
    isActive: person?.isActive ?? true,
    extraPermissions: new Set<Permission>(person?.extraPermissions ?? [])
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const update = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }));
  const needsTeam = belongsToTeam(form.role);
  const needsDepartment = form.role === "DEPARTMENT_MANAGER";

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const body: Record<string, unknown> = {
      name: form.name,
      email: form.email,
      role: form.role,
      teamId: needsTeam ? form.teamId : null,
      departmentId: needsDepartment ? form.departmentId : null,
      title: form.title,
      weeklyMinHours: Number(form.weeklyMinHours),
      weeklyMaxHours: Number(form.weeklyMaxHours)
    };
    if (form.password) body.password = form.password;
    if (person) body.isActive = form.isActive;
    if (data.canEditPermissions) body.extraPermissions = Array.from(form.extraPermissions);
    const result = await api(person ? `/api/people/${person.id}` : "/api/people", { method: person ? "PATCH" : "POST", body });
    setSaving(false);
    if (!result.ok) {
      setError(result.error ?? "השמירה נכשלה.");
      return;
    }
    onSaved(person ? `${form.name} עודכן/ה.` : `${form.name} נוסף/ה. אפשר לשלוח לו/ה את פרטי הכניסה.`);
  }

  const defaults = new Set(ROLE_DEFAULTS[form.role]);

  return (
    <Dialog title={person ? `עריכת ${person.name}` : "הוספת עובד/ת"} description={person ? ROLE_LABELS[person.role] : "חשבון חדש עם כניסה למערכת"} onClose={onClose} wide>
      <form className="form-grid" onSubmit={save}>
        <label>
          שם מלא
          <input value={form.name} onChange={(event) => update({ name: event.target.value })} required maxLength={80} />
        </label>
        <label>
          אימייל (לכניסה)
          <input type="email" value={form.email} onChange={(event) => update({ email: event.target.value })} required dir="ltr" />
        </label>
        <label>
          תפקיד במערכת
          <select value={form.role} onChange={(event) => update({ role: event.target.value as Role })}>
            {roles.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </select>
        </label>
        {needsTeam ? (
          <label>
            צוות
            <select value={form.teamId} onChange={(event) => update({ teamId: event.target.value })} required>
              {manageableTeams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </label>
        ) : needsDepartment ? (
          <label>
            מחלקה
            <select value={form.departmentId} onChange={(event) => update({ departmentId: event.target.value })} required>
              {departments
                .filter((department) => seesEverything(actorRole) || department.id === actorDepartmentId)
                .map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
            </select>
          </label>
        ) : (
          <span />
        )}
        <label>
          תפקיד / תיאור
          <input value={form.title} onChange={(event) => update({ title: event.target.value })} maxLength={60} placeholder="למשל: נציג/ה בכיר/ה" />
        </label>
        <div className="form-grid" style={{ gap: 10 }}>
          <label>
            מינ׳ שעות בשבוע
            <input type="number" min={0} max={80} value={form.weeklyMinHours} onChange={(event) => update({ weeklyMinHours: event.target.value })} />
          </label>
          <label>
            מקס׳ שעות בשבוע
            <input type="number" min={1} max={80} value={form.weeklyMaxHours} onChange={(event) => update({ weeklyMaxHours: event.target.value })} />
          </label>
        </div>
        <label className="full">
          {person ? "סיסמה חדשה (רק אם רוצים לאפס)" : "סיסמה ראשונית"}
          <input type="text" value={form.password} onChange={(event) => update({ password: event.target.value })} required={!person} minLength={10} dir="ltr" autoComplete="new-password" />
          <span className="hint">לפחות 10 תווים.</span>
        </label>
        {person ? (
          <label className="full" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={form.isActive} onChange={(event) => update({ isActive: event.target.checked })} />
            פעיל/ה (משתמשים לא פעילים לא יכולים להיכנס ולא משובצים)
          </label>
        ) : null}

        {data.canEditPermissions ? (
          <div className="dialog-section full">
            <h3>הרשאות</h3>
            <p className="hint">ההרשאות המסומנות כ&quot;כלול בתפקיד&quot; מגיעות עם התפקיד. אפשר להוסיף הרשאות נוספות לאדם הזה בלבד. הן חלות על הצוות שלו (או המחלקה, למנהל מחלקה).</p>
            <div className="permission-list">
              {PERMISSIONS.map((permission) => {
                const included = defaults.has(permission);
                const checked = included || form.extraPermissions.has(permission);
                return (
                  <label key={permission} className="permission-item">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={included}
                      onChange={(event) => {
                        const next = new Set(form.extraPermissions);
                        if (event.target.checked) next.add(permission);
                        else next.delete(permission);
                        update({ extraPermissions: next });
                      }}
                    />
                    <span>
                      {PERMISSION_LABELS[permission].label}
                      <small>{PERMISSION_LABELS[permission].description}</small>
                    </span>
                    {included ? <span className="badge">כלול בתפקיד</span> : form.extraPermissions.has(permission) ? <span className="badge accent">נוסף אישית</span> : <span />}
                  </label>
                );
              })}
            </div>
          </div>
        ) : null}

        {error ? <p className="form-error full">{error}</p> : null}
        <div className="dialog-actions full">
          <button type="button" className="secondary-button" onClick={onClose}>
            ביטול
          </button>
          <button type="submit" className="primary-button" disabled={saving}>
            {saving ? "שומר..." : person ? "שמירה" : "הוספה"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
