"use client";

import { ArrowLeftRight, Check, Gift, Palmtree, Plus, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/client";
import { getScheduleTimeParts } from "@/lib/dates";
import { dateRangeLabel, daysInRange, shiftLabel } from "@/lib/labels";
import type { Assignment, Giveaway, GiveawayStatus, SwapRequest, SwapStatus, VacationRequest, VacationStatus } from "@/lib/types";
import { AppShell, type ShellProps } from "../shell/AppShell";
import { Avatar } from "../ui/Avatar";
import { Dialog } from "../ui/Dialog";
import { useToast } from "../ui/useToast";

interface NamedShift extends Assignment {
  shiftName: string;
}

interface RequestsData {
  me: string;
  approverTeamIds: string[];
  swaps: SwapRequest[];
  giveaways: Giveaway[];
  vacations: VacationRequest[];
  myShifts: NamedShift[];
  teammates: { id: string; name: string }[];
  teammateShifts: NamedShift[];
}

type Tab = "mine" | "board" | "approvals";

const SWAP_STATUS: Record<SwapStatus, { label: string; tone: string }> = {
  PENDING_EMPLOYEE: { label: "ממתין לעמית/ה", tone: "warning" },
  PENDING_MANAGER: { label: "ממתין לאישור", tone: "warning" },
  DECLINED_BY_EMPLOYEE: { label: "העמית/ה סירב/ה", tone: "critical" },
  DECLINED_BY_MANAGER: { label: "לא אושר", tone: "critical" },
  CANCELLED: { label: "בוטל", tone: "" },
  APPROVED: { label: "אושר", tone: "good" }
};

const GIVEAWAY_STATUS: Record<GiveawayStatus, { label: string; tone: string }> = {
  OPEN: { label: "פתוח למסירה", tone: "accent" },
  PENDING_MANAGER: { label: "ממתין לאישור", tone: "warning" },
  APPROVED: { label: "אושר", tone: "good" },
  DECLINED_BY_MANAGER: { label: "לא אושר", tone: "critical" },
  CANCELLED: { label: "בוטל", tone: "" }
};

const VACATION_STATUS: Record<VacationStatus, { label: string; tone: string }> = {
  PENDING: { label: "ממתין לאישור", tone: "warning" },
  APPROVED: { label: "אושר", tone: "good" },
  DECLINED: { label: "לא אושר", tone: "critical" },
  CANCELLED: { label: "בוטל", tone: "" }
};

function Status({ value }: { value: { label: string; tone: string } }) {
  return <span className={`badge ${value.tone}`}>{value.label}</span>;
}

function namedLabel(shift: NamedShift) {
  return shiftLabel(shift.workDate, shift.shiftName, shift.startsAt, shift.endsAt);
}

export function RequestsView({ initialTab, ...shell }: ShellProps & { initialTab: Tab }) {
  const [data, setData] = useState<RequestsData | null>(null);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [dialog, setDialog] = useState<"swap" | "giveaway" | "vacation" | null>(null);
  const [busy, setBusy] = useState(false);
  const { show, toast } = useToast();
  const today = getScheduleTimeParts().dateOnly;

  const load = useCallback(async () => {
    const result = await api<RequestsData>("/api/requests");
    if (result.ok) {
      setData(result.data);
    } else {
      show(result.error ?? "הטעינה נכשלה.");
    }
  }, [show]);

  useEffect(() => {
    // Initial fetch is intentionally synchronized here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function act(path: string, body: Record<string, unknown>, done: string, method = "PATCH") {
    setBusy(true);
    const result = await api(path, { method, body });
    setBusy(false);
    if (!result.ok) {
      show(result.error ?? "הפעולה נכשלה.");
      return false;
    }
    show(done);
    setDialog(null);
    await load();
    return true;
  }

  const isApprover = (data?.approverTeamIds.length ?? 0) > 0;
  const me = data?.me;
  const approvals = useMemo(() => {
    if (!data) return { swaps: [], giveaways: [], vacations: [] };
    return {
      swaps: data.swaps.filter((swap) => swap.status === "PENDING_MANAGER" && swap.requesterId !== me && swap.targetUserId !== me),
      giveaways: data.giveaways.filter((item) => item.status === "PENDING_MANAGER" && item.offeredBy !== me && item.takenBy !== me),
      vacations: data.vacations.filter((item) => item.status === "PENDING" && item.userId !== me)
    };
  }, [data, me]);
  const approvalCount = approvals.swaps.length + approvals.giveaways.length + approvals.vacations.length;
  const board = data?.giveaways.filter((item) => item.status === "OPEN" && item.offeredBy !== me && item.workDate >= today) ?? [];

  return (
    <AppShell {...shell} title="בקשות" subtitle="החלפות, מסירות וחופשות">
      <div className="page-intro">
        <div>
          <h2>בקשות</h2>
          <p>מחליפים משמרת עם עמית/ה, מוסרים משמרת לצוות או מבקשים חופשה.</p>
        </div>
        {shell.user.teamId ? (
          <div className="toolbar">
            <button type="button" className="secondary-button" onClick={() => setDialog("swap")}>
              <ArrowLeftRight size={16} />
              החלפה
            </button>
            <button type="button" className="secondary-button" onClick={() => setDialog("giveaway")}>
              <Gift size={16} />
              מסירה
            </button>
            <button type="button" className="primary-button" onClick={() => setDialog("vacation")}>
              <Palmtree size={16} />
              חופשה
            </button>
          </div>
        ) : null}
      </div>

      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "mine"} onClick={() => setTab("mine")}>
          הבקשות שלי
        </button>
        <button type="button" role="tab" aria-selected={tab === "board"} onClick={() => setTab("board")}>
          לוח מסירות
          {board.length > 0 ? <span className="badge accent">{board.length}</span> : null}
        </button>
        {isApprover ? (
          <button type="button" role="tab" aria-selected={tab === "approvals"} onClick={() => setTab("approvals")}>
            ממתין לאישורי
            {approvalCount > 0 ? <span className="badge critical">{approvalCount}</span> : null}
          </button>
        ) : null}
      </div>

      {!data ? (
        <p className="empty-state">טוען...</p>
      ) : tab === "mine" ? (
        <div className="grid-2">
          <section className="card">
            <div className="card-header">
              <h2>החלפות ומסירות</h2>
            </div>
            <div className="request-list">
              {data.swaps.filter((swap) => swap.requesterId === me || swap.targetUserId === me).length === 0 &&
              data.giveaways.filter((item) => item.offeredBy === me || item.takenBy === me).length === 0 ? (
                <p className="empty-state">אין בקשות עדיין.</p>
              ) : null}
              {data.swaps
                .filter((swap) => swap.requesterId === me || swap.targetUserId === me)
                .map((swap) => {
                  const incoming = swap.targetUserId === me;
                  return (
                    <article key={swap.id} className="request-item">
                      <span className="action-icon"><ArrowLeftRight size={17} /></span>
                      <div>
                        <strong>{incoming ? `${swap.requesterName} מבקש/ת להחליף איתך` : `החלפה עם ${swap.targetUserName}`}</strong>
                        <p>
                          {swap.shiftLabel}
                          {swap.targetShiftLabel ? ` ⇄ ${swap.targetShiftLabel}` : ""}
                        </p>
                      </div>
                      <Status value={SWAP_STATUS[swap.status]} />
                      <div className="request-actions">
                        {incoming && swap.status === "PENDING_EMPLOYEE" ? (
                          <>
                            <button type="button" className="primary-button small" disabled={busy} onClick={() => act(`/api/swaps/${swap.id}`, { action: "accept" }, "אישרת את ההחלפה. היא ממתינה לאישור מנהל.")}>
                              <Check size={15} />
                              מסכים/ה
                            </button>
                            <button type="button" className="secondary-button small" disabled={busy} onClick={() => act(`/api/swaps/${swap.id}`, { action: "decline" }, "דחית את בקשת ההחלפה.")}>
                              לא מתאים
                            </button>
                          </>
                        ) : null}
                        {!incoming && (swap.status === "PENDING_EMPLOYEE" || swap.status === "PENDING_MANAGER") ? (
                          <button type="button" className="ghost-button small" disabled={busy} onClick={() => act(`/api/swaps/${swap.id}`, { action: "cancel" }, "הבקשה בוטלה.")}>
                            ביטול
                          </button>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              {data.giveaways
                .filter((item) => item.offeredBy === me || item.takenBy === me)
                .map((item) => (
                  <article key={item.id} className="request-item">
                    <span className="action-icon"><Gift size={17} /></span>
                    <div>
                      <strong>{item.offeredBy === me ? (item.takenByName ? `מסירה ל${item.takenByName}` : "מסירה לצוות") : `לקחת מ${item.offeredByName}`}</strong>
                      <p>{shiftLabel(item.workDate, item.shiftName, item.startsAt, item.endsAt)}</p>
                    </div>
                    <Status value={GIVEAWAY_STATUS[item.status]} />
                    {item.offeredBy === me && (item.status === "OPEN" || item.status === "PENDING_MANAGER") ? (
                      <button type="button" className="ghost-button small" disabled={busy} onClick={() => act(`/api/giveaways/${item.id}`, { action: "cancel" }, "המסירה בוטלה.")}>
                        ביטול
                      </button>
                    ) : null}
                  </article>
                ))}
            </div>
          </section>

          <section className="card">
            <div className="card-header">
              <h2>חופשות</h2>
            </div>
            <div className="request-list">
              {data.vacations.filter((item) => item.userId === me).length === 0 ? <p className="empty-state">אין בקשות חופשה.</p> : null}
              {data.vacations
                .filter((item) => item.userId === me)
                .map((item) => (
                  <article key={item.id} className="request-item">
                    <span className="action-icon"><Palmtree size={17} /></span>
                    <div>
                      <strong>{dateRangeLabel(item.startDate, item.endDate)}</strong>
                      <p>
                        {daysInRange(item.startDate, item.endDate)} ימים{item.note ? ` · ${item.note}` : ""}
                        {item.status === "APPROVED" && item.removedShiftCount > 0 ? ` · ${item.removedShiftCount} משמרות הוסרו` : ""}
                      </p>
                    </div>
                    <Status value={VACATION_STATUS[item.status]} />
                    {item.status === "PENDING" ? (
                      <button type="button" className="ghost-button small" disabled={busy} onClick={() => act(`/api/vacations/${item.id}`, { action: "cancel" }, "הבקשה בוטלה.")}>
                        ביטול
                      </button>
                    ) : null}
                  </article>
                ))}
            </div>
          </section>
        </div>
      ) : tab === "board" ? (
        <section className="card">
          <div className="card-header">
            <div>
              <h2>משמרות זמינות למסירה</h2>
              <p>משמרות שעמיתים מהצוות מוסרים. לקיחה דורשת אישור מנהל.</p>
            </div>
          </div>
          <div className="request-list">
            {board.length === 0 ? <p className="empty-state">אין כרגע משמרות למסירה.</p> : null}
            {board.map((item) => (
              <article key={item.id} className="request-item">
                <Avatar name={item.offeredByName} colorSlot={shell.teamColorSlot} />
                <div>
                  <strong>{shiftLabel(item.workDate, item.shiftName, item.startsAt, item.endsAt)}</strong>
                  <p>מוסר/ת: {item.offeredByName}</p>
                </div>
                <button type="button" className="primary-button small" disabled={busy} onClick={() => act(`/api/giveaways/${item.id}`, { action: "take" }, "ביקשת לקחת את המשמרת. ממתין לאישור.")}>
                  <Plus size={15} />
                  אני לוקח/ת
                </button>
              </article>
            ))}
          </div>
        </section>
      ) : (
        <section className="card">
          <div className="card-header">
            <div>
              <h2>ממתין לאישורך</h2>
              <p>בקשות של הצוותים שבאחריותך.</p>
            </div>
          </div>
          <div className="request-list">
            {approvalCount === 0 ? <p className="empty-state">אין בקשות שממתינות לאישור.</p> : null}
            {approvals.swaps.map((swap) => (
              <article key={swap.id} className="request-item">
                <span className="action-icon"><ArrowLeftRight size={17} /></span>
                <div>
                  <strong>
                    החלפה: {swap.requesterName} ⇄ {swap.targetUserName}
                  </strong>
                  <p>
                    {swap.shiftLabel}
                    {swap.targetShiftLabel ? ` ⇄ ${swap.targetShiftLabel}` : ""}
                  </p>
                </div>
                <div className="request-actions">
                  <button type="button" className="primary-button small" disabled={busy} onClick={() => act(`/api/swaps/${swap.id}`, { action: "approve" }, "ההחלפה אושרה והסידור עודכן.")}>
                    <Check size={15} />
                    אישור
                  </button>
                  <button type="button" className="secondary-button small" disabled={busy} onClick={() => act(`/api/swaps/${swap.id}`, { action: "reject" }, "ההחלפה נדחתה.")}>
                    <X size={15} />
                    דחייה
                  </button>
                </div>
              </article>
            ))}
            {approvals.giveaways.map((item) => (
              <article key={item.id} className="request-item">
                <span className="action-icon"><Gift size={17} /></span>
                <div>
                  <strong>
                    מסירה: {item.offeredByName} ← {item.takenByName}
                  </strong>
                  <p>{shiftLabel(item.workDate, item.shiftName, item.startsAt, item.endsAt)}</p>
                </div>
                <div className="request-actions">
                  <button type="button" className="primary-button small" disabled={busy} onClick={() => act(`/api/giveaways/${item.id}`, { action: "approve" }, "המסירה אושרה והסידור עודכן.")}>
                    <Check size={15} />
                    אישור
                  </button>
                  <button type="button" className="secondary-button small" disabled={busy} onClick={() => act(`/api/giveaways/${item.id}`, { action: "decline" }, "המסירה נדחתה.")}>
                    <X size={15} />
                    דחייה
                  </button>
                </div>
              </article>
            ))}
            {approvals.vacations.map((item) => (
              <article key={item.id} className="request-item">
                <span className="action-icon"><Palmtree size={17} /></span>
                <div>
                  <strong>
                    חופשה: {item.userName} · {dateRangeLabel(item.startDate, item.endDate)}
                  </strong>
                  <p>
                    {daysInRange(item.startDate, item.endDate)} ימים{item.note ? ` · ${item.note}` : ""}. באישור, המשמרות שלו/ה בימים אלה יוסרו.
                  </p>
                </div>
                <div className="request-actions">
                  <button type="button" className="primary-button small" disabled={busy} onClick={() => act(`/api/vacations/${item.id}`, { action: "approve" }, "החופשה אושרה.")}>
                    <Check size={15} />
                    אישור
                  </button>
                  <button type="button" className="secondary-button small" disabled={busy} onClick={() => act(`/api/vacations/${item.id}`, { action: "decline" }, "החופשה נדחתה.")}>
                    <X size={15} />
                    דחייה
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {dialog === "swap" && data ? (
        <SwapDialog data={data} busy={busy} onClose={() => setDialog(null)} onSubmit={(body) => act("/api/swaps", body, "בקשת ההחלפה נשלחה.", "POST")} />
      ) : null}
      {dialog === "giveaway" && data ? (
        <Dialog title="מסירת משמרת" description="המשמרת תוצע לכל הצוות. עמית/ה שלוקח/ת אותה צריך/ה אישור מנהל." onClose={() => setDialog(null)}>
          <GiveawayForm shifts={data.myShifts} busy={busy} onSubmit={(assignmentId) => act("/api/giveaways", { assignmentId }, "המשמרת פורסמה למסירה.", "POST")} />
        </Dialog>
      ) : null}
      {dialog === "vacation" ? (
        <Dialog title="בקשת חופשה" description="באישור, הימים יסומנו כחופש והמשמרות שלך בהם יוסרו." onClose={() => setDialog(null)}>
          <VacationForm today={today} busy={busy} onSubmit={(body) => act("/api/vacations", body, "בקשת החופשה נשלחה.", "POST")} />
        </Dialog>
      ) : null}
      {toast}
    </AppShell>
  );
}

function SwapDialog({
  data,
  busy,
  onClose,
  onSubmit
}: {
  data: RequestsData;
  busy: boolean;
  onClose: () => void;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const [mine, setMine] = useState(data.myShifts[0]?.id ?? "");
  const [target, setTarget] = useState("");
  const [theirs, setTheirs] = useState("");
  const theirShifts = data.teammateShifts.filter((shift) => shift.userId === target);
  return (
    <Dialog title="בקשת החלפה" description="העמית/ה מאשר/ת קודם, ואז מנהל/ת." onClose={onClose}>
      {data.myShifts.length === 0 ? (
        <p className="empty-state">אין לך משמרות עתידיות להחלפה.</p>
      ) : (
        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit({ requesterAssignmentId: mine, targetUserId: target, targetAssignmentId: theirs || null });
          }}
        >
          <label className="full">
            המשמרת שלי
            <select value={mine} onChange={(event) => setMine(event.target.value)} required>
              {data.myShifts.map((shift) => (
                <option key={shift.id} value={shift.id}>
                  {namedLabel(shift)}
                </option>
              ))}
            </select>
          </label>
          <label className="full">
            עם מי
            <select value={target} onChange={(event) => { setTarget(event.target.value); setTheirs(""); }} required>
              <option value="">בחירת עמית/ה</option>
              {data.teammates.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          </label>
          <label className="full">
            בתמורה למשמרת שלו/ה (לא חובה)
            <select value={theirs} onChange={(event) => setTheirs(event.target.value)} disabled={!target}>
              <option value="">בלי, רק להעביר את המשמרת שלי</option>
              {theirShifts.map((shift) => (
                <option key={shift.id} value={shift.id}>
                  {namedLabel(shift)}
                </option>
              ))}
            </select>
          </label>
          <div className="dialog-actions full">
            <button type="button" className="secondary-button" onClick={onClose}>
              ביטול
            </button>
            <button type="submit" className="primary-button" disabled={busy || !mine || !target}>
              שליחת בקשה
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

function GiveawayForm({ shifts, busy, onSubmit }: { shifts: NamedShift[]; busy: boolean; onSubmit: (assignmentId: string) => void }) {
  const [selected, setSelected] = useState(shifts[0]?.id ?? "");
  if (shifts.length === 0) {
    return <p className="empty-state">אין לך משמרות עתידיות למסירה.</p>;
  }
  return (
    <form
      className="form-grid"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(selected);
      }}
    >
      <label className="full">
        איזו משמרת
        <select value={selected} onChange={(event) => setSelected(event.target.value)}>
          {shifts.map((shift) => (
            <option key={shift.id} value={shift.id}>
              {namedLabel(shift)}
            </option>
          ))}
        </select>
      </label>
      <div className="dialog-actions full">
        <button type="submit" className="primary-button" disabled={busy || !selected}>
          <Gift size={16} />
          פרסום למסירה
        </button>
      </div>
    </form>
  );
}

function VacationForm({ today, busy, onSubmit }: { today: string; busy: boolean; onSubmit: (body: Record<string, unknown>) => void }) {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [note, setNote] = useState("");
  return (
    <form
      className="form-grid"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({ startDate, endDate: endDate || startDate, note });
      }}
    >
      <label>
        מתאריך
        <input type="date" min={today} value={startDate} onChange={(event) => setStartDate(event.target.value)} required />
      </label>
      <label>
        עד תאריך
        <input type="date" min={startDate || today} value={endDate} onChange={(event) => setEndDate(event.target.value)} />
      </label>
      <label className="full">
        הערה (לא חובה)
        <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={300} />
      </label>
      <div className="dialog-actions full">
        <button type="submit" className="primary-button" disabled={busy || !startDate}>
          שליחת בקשה
        </button>
      </div>
    </form>
  );
}
