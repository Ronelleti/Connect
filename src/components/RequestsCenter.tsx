"use client";

import { CalendarOff, Check, Gift, HandHelping, Send, Undo2, X } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AppShell } from "./AppShell";
import { addDays, formatHebrewDate } from "@/lib/dates";
import { SHIFT_DEFINITIONS } from "@/lib/shifts";
import type { ShiftAssignment, ShiftType, User } from "@/lib/types";

interface Giveaway {
  id: string;
  status: "OPEN" | "PENDING_MANAGER" | "APPROVED" | "DECLINED_BY_MANAGER" | "CANCELLED";
  weekStart: string;
  dayIndex: number;
  shiftType: ShiftType;
  offeredByEmployeeId: string;
  offeredByName: string;
  takenByEmployeeId: string | null;
  takenByName: string | null;
}

interface Vacation {
  id: string;
  employeeId: string;
  employeeName: string;
  startDate: string;
  endDate: string;
  note: string;
  status: "PENDING" | "APPROVED" | "DECLINED" | "CANCELLED";
  removedShiftCount: number;
}

interface IssueDetails {
  errors?: { message: string }[];
  warnings?: { message: string }[];
}

const GIVEAWAY_STATUS: Record<Giveaway["status"], string> = {
  OPEN: "פתוחה",
  PENDING_MANAGER: "ממתינה לאישור מנהל",
  APPROVED: "אושרה",
  DECLINED_BY_MANAGER: "נדחתה",
  CANCELLED: "בוטלה"
};

const VACATION_STATUS: Record<Vacation["status"], string> = {
  PENDING: "ממתינה לאישור",
  APPROVED: "אושרה",
  DECLINED: "נדחתה",
  CANCELLED: "בוטלה"
};

function describeShift(weekStart: string, dayIndex: number, shiftType: ShiftType) {
  const definition = SHIFT_DEFINITIONS[shiftType];
  return `${definition.label} · ${formatHebrewDate(addDays(weekStart, dayIndex))} (${definition.startsAt}-${definition.endsAt})`;
}

function describeDates(vacation: Vacation) {
  return vacation.startDate === vacation.endDate
    ? formatHebrewDate(vacation.startDate)
    : `${formatHebrewDate(vacation.startDate)} - ${formatHebrewDate(vacation.endDate)}`;
}

export function RequestsCenter({ currentUser }: { currentUser: User }) {
  const isManager = currentUser.role === "MANAGER";
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [giveaways, setGiveaways] = useState<Giveaway[]>([]);
  const [offerableShifts, setOfferableShifts] = useState<ShiftAssignment[]>([]);
  const [myVacations, setMyVacations] = useState<Vacation[]>([]);
  const [managedVacations, setManagedVacations] = useState<Vacation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [offerAssignmentId, setOfferAssignmentId] = useState("");
  const [vacationForm, setVacationForm] = useState({ startDate: "", endDate: "", note: "" });
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [giveawayResponse, vacationResponse] = await Promise.all([
        fetch("/api/giveaways", { cache: "no-store" }),
        fetch("/api/vacations", { cache: "no-store" })
      ]);
      if (cancelled) {
        return;
      }
      if (giveawayResponse.ok) {
        const body = await giveawayResponse.json();
        setEmployeeId(body.employeeId);
        setGiveaways(body.giveaways ?? []);
        setOfferableShifts(body.offerableShifts ?? []);
      }
      if (vacationResponse.ok) {
        const body = await vacationResponse.json();
        setMyVacations(body.myRequests ?? []);
        setManagedVacations(body.managedRequests ?? []);
      }
      setIsLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  async function send(
    url: string,
    method: "POST" | "PATCH",
    payload: Record<string, unknown>,
    busyKey: string
  ): Promise<{ ok: boolean; body: { error?: string; details?: IssueDetails; removedShifts?: unknown[] } }> {
    setBusyId(busyKey);
    setMessage(null);
    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const body = await response.json().catch(() => ({}));
      return { ok: response.ok, body };
    } finally {
      setBusyId(null);
    }
  }

  function errorMessage(body: { error?: string; details?: IssueDetails }, fallback: string) {
    return body.details?.errors?.[0]?.message ?? body.error ?? fallback;
  }

  async function offerShift(event: FormEvent) {
    event.preventDefault();
    if (!offerAssignmentId) {
      return;
    }
    const { ok, body } = await send("/api/giveaways", "POST", { assignmentId: offerAssignmentId }, "offer");
    if (!ok) {
      setMessage(errorMessage(body, "מסירת המשמרת נכשלה."));
      return;
    }
    setOfferAssignmentId("");
    setMessage("המשמרת פורסמה למסירה. כל העובדים קיבלו התראה.");
    reload();
  }

  async function giveawayAction(giveaway: Giveaway, action: "take" | "cancel" | "approve" | "decline") {
    let result = await send(`/api/giveaways/${giveaway.id}`, "PATCH", { action }, giveaway.id);
    const warnings = result.body.details?.warnings ?? [];
    if (!result.ok && action === "take" && warnings.length > 0 && !(result.body.details?.errors?.length)) {
      const confirmed = window.confirm(
        `${warnings.map((warning) => warning.message).join("\n")}\n\nלקחת את המשמרת בכל זאת?`
      );
      if (!confirmed) {
        return;
      }
      result = await send(
        `/api/giveaways/${giveaway.id}`,
        "PATCH",
        { action, acknowledgeWarnings: true },
        giveaway.id
      );
    }
    if (!result.ok) {
      setMessage(errorMessage(result.body, "הפעולה נכשלה."));
      reload();
      return;
    }
    setMessage(
      {
        take: "ביקשת לקחת את המשמרת. הבקשה נשלחה לאישור המנהל.",
        cancel: "מסירת המשמרת בוטלה.",
        approve: "המסירה אושרה והסידור עודכן.",
        decline: "המסירה נדחתה."
      }[action]
    );
    reload();
  }

  async function requestVacation(event: FormEvent) {
    event.preventDefault();
    const { ok, body } = await send("/api/vacations", "POST", vacationForm, "vacation");
    if (!ok) {
      setMessage(errorMessage(body, "שליחת הבקשה נכשלה."));
      return;
    }
    setVacationForm({ startDate: "", endDate: "", note: "" });
    setMessage("בקשת החופשה נשלחה למנהל.");
    reload();
  }

  async function vacationAction(vacation: Vacation, action: "approve" | "decline" | "cancel") {
    if (
      action === "approve" &&
      !window.confirm(
        `לאשר חופשה ל${vacation.employeeName} (${describeDates(vacation)})?\nהמשמרות שלו/ה בימים אלה יוסרו מהסידור.`
      )
    ) {
      return;
    }
    const { ok, body } = await send(`/api/vacations/${vacation.id}`, "PATCH", { action }, vacation.id);
    if (!ok) {
      setMessage(errorMessage(body, "הפעולה נכשלה."));
      reload();
      return;
    }
    const removed = (body.removedShifts ?? []).length;
    setMessage(
      action === "approve"
        ? removed > 0
          ? `החופשה אושרה. ${removed} משמרות הוסרו מהסידור ויש לשבץ אותן מחדש.`
          : "החופשה אושרה."
        : action === "decline"
          ? "בקשת החופשה נדחתה."
          : "הבקשה בוטלה."
    );
    reload();
  }

  const activeGiveaways = giveaways.filter(
    (giveaway) => giveaway.status === "OPEN" || giveaway.status === "PENDING_MANAGER"
  );
  const pastGiveaways = giveaways.filter((giveaway) => !activeGiveaways.includes(giveaway));
  const pendingVacations = managedVacations.filter((vacation) => vacation.status === "PENDING");
  const decidedVacations = managedVacations.filter((vacation) => vacation.status !== "PENDING");

  return (
    <AppShell currentUser={currentUser} active="requests">
      <section className="schedule-toolbar">
        <div>
          <p className="eyebrow">Wecomconnect</p>
          <h1>בקשות</h1>
        </div>
      </section>

      {message ? (
        <div className="requests-message" role="status">
          <span>{message}</span>
          <button onClick={() => setMessage(null)} title="סגירה">
            <X size={15} />
          </button>
        </div>
      ) : null}

      {isLoading ? (
        <p className="empty-state">טוען נתונים...</p>
      ) : (
        <div className="requests-grid">
          <section className="summary-block requests-section">
            <h2>
              <Gift size={18} /> מסירת משמרות
            </h2>

            {employeeId ? (
              <form className="requests-form" onSubmit={offerShift}>
                <label>
                  משמרת שלך למסירה
                  <select
                    value={offerAssignmentId}
                    onChange={(event) => setOfferAssignmentId(event.target.value)}
                  >
                    <option value="">בחירת משמרת...</option>
                    {offerableShifts.map((shift) => (
                      <option key={shift.id} value={shift.id}>
                        {describeShift(shift.weekStart, shift.dayIndex, shift.shiftType)}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="primary-button"
                  type="submit"
                  disabled={!offerAssignmentId || busyId === "offer"}
                >
                  <Send size={16} /> פרסום למסירה
                </button>
              </form>
            ) : null}

            <h3>משמרות זמינות</h3>
            {activeGiveaways.length === 0 ? (
              <p className="swap-empty">אין כרגע משמרות למסירה.</p>
            ) : (
              <ul className="requests-list">
                {activeGiveaways.map((giveaway) => {
                  const isMine = giveaway.offeredByEmployeeId === employeeId;
                  const busy = busyId === giveaway.id;
                  return (
                    <li key={giveaway.id} className="requests-item">
                      <div>
                        <strong>{describeShift(giveaway.weekStart, giveaway.dayIndex, giveaway.shiftType)}</strong>
                        <span>
                          {isMine ? "המשמרת שלך" : `מוסר/ת: ${giveaway.offeredByName}`}
                          {giveaway.takenByName ? ` · לוקח/ת: ${giveaway.takenByName}` : ""}
                        </span>
                        <em className={`request-status ${giveaway.status}`}>{GIVEAWAY_STATUS[giveaway.status]}</em>
                      </div>
                      <div className="requests-actions">
                        {giveaway.status === "OPEN" && employeeId && !isMine ? (
                          <button className="approve" disabled={busy} onClick={() => giveawayAction(giveaway, "take")}>
                            <HandHelping size={15} /> לקחת
                          </button>
                        ) : null}
                        {isMine ? (
                          <button className="decline" disabled={busy} onClick={() => giveawayAction(giveaway, "cancel")}>
                            <Undo2 size={15} /> ביטול
                          </button>
                        ) : null}
                        {isManager && giveaway.status === "PENDING_MANAGER" ? (
                          <>
                            <button className="approve" disabled={busy} onClick={() => giveawayAction(giveaway, "approve")}>
                              <Check size={15} /> אישור
                            </button>
                            <button className="decline" disabled={busy} onClick={() => giveawayAction(giveaway, "decline")}>
                              <X size={15} /> דחייה
                            </button>
                          </>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {pastGiveaways.length > 0 ? (
              <>
                <h3>היסטוריה (30 יום)</h3>
                <ul className="requests-list compact">
                  {pastGiveaways.map((giveaway) => (
                    <li key={giveaway.id} className="requests-item">
                      <div>
                        <strong>{describeShift(giveaway.weekStart, giveaway.dayIndex, giveaway.shiftType)}</strong>
                        <span>
                          {giveaway.offeredByName}
                          {giveaway.takenByName ? ` ← ${giveaway.takenByName}` : ""}
                        </span>
                      </div>
                      <em className={`request-status ${giveaway.status}`}>{GIVEAWAY_STATUS[giveaway.status]}</em>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </section>

          <section className="summary-block requests-section">
            <h2>
              <CalendarOff size={18} /> חופשות
            </h2>

            {employeeId ? (
              <>
                <form className="requests-form" onSubmit={requestVacation}>
                  <div className="requests-date-row">
                    <label>
                      מתאריך
                      <input
                        type="date"
                        required
                        value={vacationForm.startDate}
                        onChange={(event) =>
                          setVacationForm((form) => ({
                            ...form,
                            startDate: event.target.value,
                            endDate: form.endDate && form.endDate >= event.target.value ? form.endDate : event.target.value
                          }))
                        }
                      />
                    </label>
                    <label>
                      עד תאריך
                      <input
                        type="date"
                        required
                        min={vacationForm.startDate || undefined}
                        value={vacationForm.endDate}
                        onChange={(event) => setVacationForm((form) => ({ ...form, endDate: event.target.value }))}
                      />
                    </label>
                  </div>
                  <label>
                    הערה (לא חובה)
                    <input
                      type="text"
                      maxLength={300}
                      value={vacationForm.note}
                      onChange={(event) => setVacationForm((form) => ({ ...form, note: event.target.value }))}
                    />
                  </label>
                  <button className="primary-button" type="submit" disabled={busyId === "vacation"}>
                    <Send size={16} /> שליחת בקשת חופשה
                  </button>
                </form>

                <h3>הבקשות שלי</h3>
                {myVacations.length === 0 ? (
                  <p className="swap-empty">עוד לא ביקשת חופשה.</p>
                ) : (
                  <ul className="requests-list compact">
                    {myVacations.map((vacation) => (
                      <li key={vacation.id} className="requests-item">
                        <div>
                          <strong>{describeDates(vacation)}</strong>
                          {vacation.note ? <span>{vacation.note}</span> : null}
                        </div>
                        <div className="requests-actions">
                          <em className={`request-status ${vacation.status}`}>{VACATION_STATUS[vacation.status]}</em>
                          {vacation.status === "PENDING" ? (
                            <button
                              className="decline"
                              disabled={busyId === vacation.id}
                              onClick={() => vacationAction(vacation, "cancel")}
                            >
                              <Undo2 size={15} /> ביטול
                            </button>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : null}

            {isManager ? (
              <>
                <h3>ממתינות לאישורך</h3>
                {pendingVacations.length === 0 ? (
                  <p className="swap-empty">אין בקשות חופשה ממתינות.</p>
                ) : (
                  <ul className="requests-list">
                    {pendingVacations.map((vacation) => (
                      <li key={vacation.id} className="requests-item">
                        <div>
                          <strong>{vacation.employeeName}</strong>
                          <span>{describeDates(vacation)}</span>
                          {vacation.note ? <span>{vacation.note}</span> : null}
                        </div>
                        <div className="requests-actions">
                          <button
                            className="approve"
                            disabled={busyId === vacation.id}
                            onClick={() => vacationAction(vacation, "approve")}
                          >
                            <Check size={15} /> אישור
                          </button>
                          <button
                            className="decline"
                            disabled={busyId === vacation.id}
                            onClick={() => vacationAction(vacation, "decline")}
                          >
                            <X size={15} /> דחייה
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                {decidedVacations.length > 0 ? (
                  <>
                    <h3>החלטות אחרונות</h3>
                    <ul className="requests-list compact">
                      {decidedVacations.map((vacation) => (
                        <li key={vacation.id} className="requests-item">
                          <div>
                            <strong>{vacation.employeeName}</strong>
                            <span>
                              {describeDates(vacation)}
                              {vacation.removedShiftCount > 0 ? ` · ${vacation.removedShiftCount} משמרות הוסרו` : ""}
                            </span>
                          </div>
                          <em className={`request-status ${vacation.status}`}>{VACATION_STATUS[vacation.status]}</em>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </>
            ) : null}
          </section>
        </div>
      )}
    </AppShell>
  );
}
