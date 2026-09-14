"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Bell,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  LogOut,
  MessageSquare,
  Pencil,
  Plus,
  Repeat2,
  Search,
  Share2,
  ShieldAlert,
  Trash2,
  UserRound,
  UserPlus,
  UsersRound,
  Wand2,
  X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { AvailabilityPanel } from "./AvailabilityPanel";
import { AssignmentUndoToast } from "./AssignmentUndoToast";
import { CurrentShiftBanner } from "./CurrentShiftBanner";
import { EmployeeEditorDialog, type EmployeeEditor } from "./EmployeeEditorDialog";
import { ShiftWorkerPicker } from "./ShiftWorkerPicker";
import { ThemeToggle } from "./ThemeToggle";
import {
  availabilityStatusLabel,
  findShiftAvailability,
  findTimeOff,
  getAssignmentAvailabilityHint,
  isUnavailableForShift
} from "@/lib/availability";
import { addDays, formatHebrewDate, getScheduleDays } from "@/lib/dates";
import { getEmployeeColor } from "@/lib/employeeColors";
import { createSchedulePdf, schedulePdfFilename, shareOrDownloadPdf } from "@/lib/schedulePdf";
import { buildScheduleCsv, scheduleExportFilename } from "@/lib/scheduleExport";
import { SHIFT_DEFINITIONS, getShiftTypes } from "@/lib/shifts";
import { useAvailabilityView } from "@/hooks/useAvailabilityView";
import { useUndoableAction } from "@/hooks/useUndoableAction";
import type {
  AvailabilityBlock,
  AvailabilityStatus,
  Employee,
  EmployeeSummary,
  ShiftAssignment,
  ShiftSwapRequest,
  ShiftType,
  User
} from "@/lib/types";

interface SchedulePayload {
  weekStart: string;
  availabilityWeekStart: string;
  employees: Employee[];
  assignments: ShiftAssignment[];
  scheduleAvailabilityBlocks: AvailabilityBlock[];
  availabilityBlocks: AvailabilityBlock[];
  swaps: ShiftSwapRequest[];
  summaries: EmployeeSummary[];
}

interface PendingAssignment {
  employeeId: string;
  dayIndex: number;
  shiftType: ShiftType;
  warnings: string[];
  replaceAssignmentId: string | null;
}

interface PendingReplacement {
  employeeId: string;
  employeeName: string;
  dayIndex: number;
  shiftType: ShiftType;
  existingAssignmentId: string;
  existingEmployeeName: string;
}

interface SwapSubmission {
  requesterAssignmentId: string;
  targetEmployeeId: string;
  targetAssignmentId?: string;
}

interface PendingSwap {
  submission: SwapSubmission;
  warnings: string[];
}

interface AssignmentPicker {
  cellKey: string;
  employeeId: string;
}

type NavigationSection = "schedule" | "employees" | "notifications" | "swaps";

const EMPTY_SCHEDULE: SchedulePayload = {
  weekStart: "",
  availabilityWeekStart: "",
  employees: [],
  assignments: [],
  scheduleAvailabilityBlocks: [],
  availabilityBlocks: [],
  swaps: [],
  summaries: []
};

const AVAILABILITY_PAGE_SIZE = 5;
const ASSIGNMENT_UNDO_DURATION_MS = 6000;
const LIVE_SCHEDULE_REFRESH_MS = 10_000;

export function ScheduleDashboard({
  currentUser,
  initialWeekStart,
  initialAvailabilityWeekStart
}: {
  currentUser: User;
  initialWeekStart: string;
  initialAvailabilityWeekStart: string;
}) {
  const router = useRouter();
  const [weekStart, setWeekStart] = useState(initialWeekStart);
  const [schedule, setSchedule] = useState<SchedulePayload>(EMPTY_SCHEDULE);
  const [assignmentPicker, setAssignmentPicker] = useState<AssignmentPicker | null>(null);
  const [pendingAssignment, setPendingAssignment] = useState<PendingAssignment | null>(null);
  const [pendingReplacement, setPendingReplacement] = useState<PendingReplacement | null>(null);
  const [pendingSwap, setPendingSwap] = useState<PendingSwap | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSection, setActiveSection] = useState<NavigationSection>("schedule");
  const [isAvailabilityFilterOpen, setIsAvailabilityFilterOpen] = useState(false);
  const [employeeEditor, setEmployeeEditor] = useState<EmployeeEditor | null>(null);
  const [employeeToDelete, setEmployeeToDelete] = useState<Employee | null>(null);
  const [toast, setToast] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingEmployee, setIsSavingEmployee] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isGeneratingSchedule, setIsGeneratingSchedule] = useState(false);
  const scheduleTableRef = useRef<HTMLDivElement>(null);
  const swapFormRef = useRef<HTMLFormElement>(null);
  const pendingAssignmentRemovalsRef = useRef(new Map<string, ShiftAssignment>());

  const days = useMemo(() => getScheduleDays(weekStart), [weekStart]);
  const availabilityDays = useMemo(
    () => getScheduleDays(initialAvailabilityWeekStart),
    [initialAvailabilityWeekStart]
  );
  const assignmentsByCell = useMemo(() => groupAssignments(schedule.assignments), [schedule.assignments]);
  const employeesById = useMemo(
    () => new Map(schedule.employees.map((employee) => [employee.id, employee])),
    [schedule.employees]
  );
  const ownEmployee = useMemo(
    () => schedule.employees.find((employee) => employee.userId === currentUser.id),
    [currentUser.id, schedule.employees]
  );
  const matchingEmployeeIds = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase("he");
    return new Set(
      schedule.employees
        .filter((employee) =>
          !query || [employee.name, employee.email, employee.roleTitle]
            .some((value) => value.toLocaleLowerCase("he").includes(query))
        )
        .map((employee) => employee.id)
    );
  }, [schedule.employees, searchQuery]);
  const availabilityPageSize = currentUser.role === "MANAGER"
    ? AVAILABILITY_PAGE_SIZE
    : Math.max(schedule.employees.length, 1);
  const availabilityView = useAvailabilityView({
    employees: schedule.employees,
    visibleEmployeeIds: matchingEmployeeIds,
    pageSize: availabilityPageSize,
    resetKey: `${initialAvailabilityWeekStart}:${searchQuery}`
  });
  const openAvailabilityFilter = useCallback(() => setIsAvailabilityFilterOpen(true), []);
  const closeAvailabilityFilter = useCallback(() => setIsAvailabilityFilterOpen(false), []);
  const swapSourceAssignments = useMemo(
    () =>
      currentUser.role === "MANAGER"
        ? schedule.assignments
        : schedule.assignments.filter((assignment) => assignment.employeeId === ownEmployee?.id),
    [currentUser.role, ownEmployee?.id, schedule.assignments]
  );
  const unavailableEmployeesByCell = useMemo(
    () => groupUnavailableEmployees(
      schedule.employees.filter((employee) => matchingEmployeeIds.has(employee.id)),
      schedule.scheduleAvailabilityBlocks
    ),
    [matchingEmployeeIds, schedule.employees, schedule.scheduleAvailabilityBlocks]
  );
  const activeSwaps = useMemo(
    () => schedule.swaps.filter(
      (swap) => swap.status === "PENDING_EMPLOYEE" || swap.status === "PENDING_MANAGER"
    ),
    [schedule.swaps]
  );
  const swapHistory = useMemo(
    () => schedule.swaps.filter(
      (swap) => swap.status !== "PENDING_EMPLOYEE" && swap.status !== "PENDING_MANAGER"
    ),
    [schedule.swaps]
  );

  const loadSchedule = useCallback(async (nextWeekStart = weekStart) => {
    setIsLoading(true);
    const response = await fetch(
      `/api/schedule?weekStart=${nextWeekStart}&availabilityWeekStart=${initialAvailabilityWeekStart}`,
      { cache: "no-store" }
    );
    if (response.ok) {
      const payload = (await response.json()) as SchedulePayload;
      setSchedule(hidePendingAssignmentRemovals(payload, pendingAssignmentRemovalsRef.current));
    }
    setIsLoading(false);
  }, [initialAvailabilityWeekStart, weekStart]);

  const restoreAssignment = useCallback((assignment: ShiftAssignment) => {
    pendingAssignmentRemovalsRef.current.delete(assignment.id);
    setSchedule((current) => restoreAssignmentInSchedule(current, assignment));
  }, []);

  const commitAssignmentRemoval = useCallback(async (assignment: ShiftAssignment) => {
    const response = await fetch(`/api/assignments/${assignment.id}`, { method: "DELETE" });
    if (!response.ok) {
      restoreAssignment(assignment);
      setToast("מחיקת השיבוץ נכשלה והשיבוץ הוחזר.");
      return;
    }
    pendingAssignmentRemovalsRef.current.delete(assignment.id);
    setToast("השיבוץ נמחק.");
  }, [restoreAssignment]);

  const assignmentRemoval = useUndoableAction({
    durationMs: ASSIGNMENT_UNDO_DURATION_MS,
    onExpire: commitAssignmentRemoval,
    onUndo: restoreAssignment
  });

  useEffect(() => {
    // Initial and week-change data fetching is intentionally synchronized here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSchedule(weekStart);
  }, [weekStart, loadSchedule]);

  useEffect(() => {
    const refreshVisibleSchedule = () => {
      if (document.visibilityState === "visible") {
        void loadSchedule(weekStart);
      }
    };
    const intervalId = window.setInterval(refreshVisibleSchedule, LIVE_SCHEDULE_REFRESH_MS);
    window.addEventListener("focus", refreshVisibleSchedule);
    document.addEventListener("visibilitychange", refreshVisibleSchedule);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshVisibleSchedule);
      document.removeEventListener("visibilitychange", refreshVisibleSchedule);
    };
  }, [loadSchedule, weekStart]);

  async function assignShift(
    employeeId: string,
    dayIndex: number,
    shiftType: ShiftType,
    acknowledgeWarnings = false,
    replaceAssignmentId: string | null = null
  ) {
    const response = await fetch("/api/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId,
        weekStart,
        dayIndex,
        shiftType,
        acknowledgeWarnings,
        replaceAssignmentId
      })
    });
    const body = await response.json();

    if (!response.ok) {
      const warnings = (body.details?.warnings ?? []).map(
        (warning: { message: string }) => warning.message
      );
      if (warnings.length > 0 && !(body.details?.errors?.length > 0)) {
        setPendingAssignment({
          employeeId,
          dayIndex,
          shiftType,
          warnings,
          replaceAssignmentId
        });
        return;
      }
      setToast(body.details?.errors?.[0]?.message ?? body.error ?? "השיבוץ נכשל.");
      return;
    }

    setPendingAssignment(null);
    setToast(
      replaceAssignmentId
        ? "העובד הוחלף בהצלחה."
        : acknowledgeWarnings
          ? "השיבוץ נשמר לאחר אישור האזהרה."
          : "השיבוץ נשמר."
    );
    await loadSchedule();
  }

  async function generateSchedule() {
    if (isGeneratingSchedule) {
      return;
    }
    setIsGeneratingSchedule(true);
    const response = await fetch("/api/schedule/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weekStart })
    });
    const body = await response.json();
    setIsGeneratingSchedule(false);

    if (!response.ok) {
      setToast(body.error ?? "יצירת הסידור האוטומטי נכשלה.");
      return;
    }

    const createdCount = (body.created ?? []).length;
    const relaxedCount = (body.relaxedRest ?? []).length;
    const unfilledCount = (body.unfilled ?? []).length;
    const messageParts = [
      createdCount > 0 ? `נוצרו ${createdCount} שיבוצים אוטומטית.` : "לא נמצאו משמרות פנויות לשיבוץ."
    ];
    if (relaxedCount > 0) {
      messageParts.push(`ב-${relaxedCount} מהן הוקל כלל המנוחה בגלל מחסור בעובדים זמינים.`);
    }
    if (unfilledCount > 0) {
      messageParts.push(`${unfilledCount} משמרות נשארו פנויות ודורשות שיבוץ ידני.`);
    }
    setToast(messageParts.join(" "));
    await loadSchedule();
  }

  function stageAssignmentRemoval(assignment: ShiftAssignment) {
    if (assignmentRemoval.pending) {
      return;
    }
    pendingAssignmentRemovalsRef.current.set(assignment.id, assignment);
    setSchedule((current) => removeAssignmentFromSchedule(current, assignment));
    assignmentRemoval.stage(assignment);
  }

  const setShiftAvailability = useCallback(async function setShiftAvailability(
    employeeId: string,
    dayIndex: number,
    shiftType: ShiftType,
    status: AvailabilityStatus | "AVAILABLE"
  ) {
    const existing = findShiftAvailability(
      schedule.availabilityBlocks,
      employeeId,
      dayIndex,
      shiftType
    );
    if (status === "AVAILABLE" && !existing) {
      return;
    }
    const response = status === "AVAILABLE" && existing
      ? await fetch(`/api/availability/${existing.id}`, { method: "DELETE" })
      : await fetch("/api/availability", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            employeeId,
            weekStart: initialAvailabilityWeekStart,
            dayIndex,
            shiftType,
            status,
            reason: availabilityStatusLabel(status)
          })
        });

    setToast(response.ok ? "הזמינות עודכנה." : "עדכון הזמינות נכשל.");
    if (response.ok) {
      await loadSchedule();
    }
  }, [initialAvailabilityWeekStart, loadSchedule, schedule.availabilityBlocks]);

  const toggleTimeOff = useCallback(async function toggleTimeOff(
    employeeId: string,
    dayIndex: number
  ) {
    const existing = findTimeOff(schedule.availabilityBlocks, employeeId, dayIndex);
    const response = existing
      ? await fetch(`/api/availability/${existing.id}`, { method: "DELETE" })
      : await fetch("/api/availability", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            employeeId,
            weekStart: initialAvailabilityWeekStart,
            dayIndex,
            status: "TIME_OFF",
            reason: "חופש"
          })
        });

    setToast(response.ok ? (existing ? "החופשה הוסרה." : "החופשה נשמרה.") : "עדכון החופשה נכשל.");
    if (response.ok) {
      await loadSchedule();
    }
  }, [initialAvailabilityWeekStart, loadSchedule, schedule.availabilityBlocks]);

  async function createSwap(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const submission: SwapSubmission = {
      requesterAssignmentId: String(formData.get("requesterAssignmentId") ?? ""),
      targetEmployeeId: String(formData.get("targetEmployeeId") ?? "")
    };
    await submitSwap(submission);
  }

  async function submitSwap(submission: SwapSubmission, acknowledgeWarnings = false) {
    const response = await fetch("/api/swaps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...submission, acknowledgeWarnings })
    });

    const body = await response.json();
    if (!response.ok) {
      const warnings = (body.details?.warnings ?? []).map(
        (warning: { message: string }) => warning.message
      );
      if (warnings.length > 0 && !(body.details?.errors?.length > 0)) {
        setPendingSwap({ submission, warnings });
        return;
      }
      setToast(body.details?.errors?.[0]?.message ?? body.error ?? "בקשת ההחלפה נכשלה.");
      return;
    }

    setPendingSwap(null);
    setToast(
      acknowledgeWarnings
        ? "בקשת ההחלפה נשלחה לאחר אישור אזהרת 8–8."
        : "בקשת ההחלפה נשלחה."
    );
    swapFormRef.current?.reset();
    await loadSchedule();
  }

  async function decideSwap(id: string, action: string) {
    const response = await fetch(`/api/swaps/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action })
    });
    const body = await response.json();
    setToast(
      response.ok
        ? swapDecisionMessage(body.swap as ShiftSwapRequest)
        : body.error ?? "עדכון ההחלפה נכשל."
    );
    await loadSchedule();
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  function exportSchedule() {
    const csv = buildScheduleCsv({
      weekStart,
      employees: schedule.employees,
      assignments: schedule.assignments,
      summaries: schedule.summaries
    });
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = scheduleExportFilename(weekStart);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setToast("טבלת השיבוץ יוצאה בהצלחה.");
  }

  async function exportSchedulePdf() {
    if (!scheduleTableRef.current || isExportingPdf) {
      return;
    }
    setIsExportingPdf(true);
    setToast("מכין קובץ PDF...");
    try {
      const blob = await createSchedulePdf(scheduleTableRef.current);
      const result = await shareOrDownloadPdf(blob, schedulePdfFilename(weekStart));
      setToast(
        result === "shared"
          ? "קובץ ה-PDF שותף בהצלחה."
          : result === "cancelled"
            ? "השיתוף בוטל."
            : "קובץ ה-PDF הורד בהצלחה."
      );
    } catch (error) {
      console.error(error);
      setToast("יצירת קובץ ה-PDF נכשלה.");
    } finally {
      setIsExportingPdf(false);
    }
  }

  async function saveEmployee(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!employeeEditor) {
      return;
    }
    setIsSavingEmployee(true);
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    const isCreate = employeeEditor.mode === "create";
    const response = await fetch(
      isCreate ? "/api/employees" : `/api/employees/${employeeEditor.employee.id}`,
      {
        method: isCreate ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }
    );
    const body = await response.json();
    setIsSavingEmployee(false);
    if (!response.ok) {
      setToast(body.error ?? "שמירת העובד נכשלה.");
      return;
    }
    setEmployeeEditor(null);
    setToast(isCreate ? "העובד נוסף למערכת." : "פרטי העובד עודכנו.");
    await loadSchedule();
  }

  async function deleteEmployee() {
    if (!employeeToDelete) {
      return;
    }
    const response = await fetch(`/api/employees/${employeeToDelete.id}`, { method: "DELETE" });
    const body = await response.json();
    if (!response.ok) {
      setToast(body.error ?? "מחיקת העובד נכשלה.");
      return;
    }
    setEmployeeToDelete(null);
    setToast("העובד נמחק מהמערכת.");
    await loadSchedule();
  }

  function navigateTo(section: NavigationSection, elementId: string) {
    setActiveSection(section);
    document.getElementById(elementId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function showNotifications() {
    setActiveSection("notifications");
    const pending = schedule.swaps.filter((swap) =>
      swap.status === "PENDING_EMPLOYEE" || swap.status === "PENDING_MANAGER"
    ).length;
    setToast(pending > 0 ? `${pending} בקשות החלפה ממתינות לאישור.` : "אין התראות חדשות.");
  }

  return (
    <div className="app-frame">
      <aside className="icon-rail" aria-label="ניווט">
        <div className="rail-logo">
          <Image src="/wecom-logo.svg" alt="wecom" width={92} height={42} priority />
        </div>
        <button
          title="לוח משמרות"
          className={`rail-button ${activeSection === "schedule" ? "active" : ""}`}
          onClick={() => navigateTo("schedule", "schedule-section")}
        >
          <CalendarDays size={20} />
        </button>
        <button
          title="עובדים"
          className={`rail-button ${activeSection === "employees" ? "active" : ""}`}
          onClick={() => navigateTo("employees", "employees-section")}
        >
          <UsersRound size={20} />
        </button>
        <button
          title="התראות"
          className={`rail-button ${activeSection === "notifications" ? "active" : ""}`}
          onClick={showNotifications}
        >
          <Bell size={20} />
        </button>
        <button
          title="החלפות"
          className={`rail-button ${activeSection === "swaps" ? "active" : ""}`}
          onClick={() => navigateTo("swaps", "swaps-section")}
        >
          <Repeat2 size={20} />
        </button>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div className="topbar-logo">
            <Image src="/wecom-logo.svg" alt="wecom" width={104} height={47} priority />
            <span>connect</span>
          </div>
          <div className="search-box">
            <Search size={18} />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="חיפוש עובד"
              aria-label="חיפוש עובד"
            />
            {searchQuery ? (
              <button className="search-clear" onClick={() => setSearchQuery("")} title="נקה חיפוש">
                <X size={15} />
              </button>
            ) : null}
          </div>
          <div className="topbar-actions">
            <span className="trial-pill">ניהול משמרות</span>
            <span className="user-pill">
              <UserRound size={18} />
              {currentUser.name}
            </span>
            <ThemeToggle />
            <button className="icon-button" onClick={logout} title="יציאה">
              <LogOut size={18} />
            </button>
          </div>
        </header>

        <main className="scheduler-page">
          <CurrentShiftBanner />

          <section className="schedule-toolbar" id="schedule-section">
            <div>
              <p className="eyebrow">Wecomconnect</p>
              <h1>לוח משמרות שבועי</h1>
            </div>
            <div className="toolbar-controls">
              <button className="soft-button" onClick={() => setWeekStart(addDays(weekStart, -7))}>
                <ChevronRight size={18} />
              </button>
              <div className="week-pill">
                {formatHebrewDate(weekStart)} - {formatHebrewDate(addDays(weekStart, 6))}
              </div>
              <button className="soft-button" onClick={() => setWeekStart(addDays(weekStart, 7))}>
                <ChevronLeft size={18} />
              </button>
              {currentUser.role === "MANAGER" ? (
                <button
                  className="export-button"
                  onClick={generateSchedule}
                  disabled={isGeneratingSchedule}
                  title="שיבוץ אוטומטי של המשמרות הפנויות בשבוע זה"
                >
                  <Wand2 size={17} />
                  {isGeneratingSchedule ? "יוצר סידור..." : "יצירת סידור אוטומטי"}
                </button>
              ) : null}
              <button className="export-button" onClick={exportSchedule}>
                <Download size={17} />
                ייצוא טבלה
              </button>
              <button
                className="export-button"
                onClick={exportSchedulePdf}
                disabled={isExportingPdf}
              >
                <Share2 size={17} />
                {isExportingPdf ? "מכין PDF..." : "PDF / שיתוף"}
              </button>
            </div>
          </section>

          <section className="main-grid">
            <div
              className="schedule-panel"
              ref={scheduleTableRef}
              data-pdf-target="schedule"
            >
              <div className="schedule-pdf-header pdf-only">
                <Image src="/wecom-logo.svg" alt="wecom" width={96} height={44} />
                <div>
                  <strong>סידור עבודה שבועי</strong>
                  <span>{formatHebrewDate(weekStart)} - {formatHebrewDate(addDays(weekStart, 6))}</span>
                </div>
              </div>
              <div className="grid-header">
                <div className="shift-label-column">משמרת</div>
                {days.map((day) => (
                  <div className="day-header" key={day.index}>
                    <strong>{day.label}</strong>
                    <span>{formatHebrewDate(day.date)}</span>
                  </div>
                ))}
              </div>

              {getShiftTypes().map((shiftType) => (
                <div className="shift-row" key={shiftType}>
                  <div className={`shift-name ${SHIFT_DEFINITIONS[shiftType].tone}`}>
                    <Clock3 size={18} />
                    <strong>{SHIFT_DEFINITIONS[shiftType].label}</strong>
                    <span>
                      {SHIFT_DEFINITIONS[shiftType].startsAt}-{SHIFT_DEFINITIONS[shiftType].endsAt}
                    </span>
                  </div>
                  {days.map((day) => {
                    const key = cellKey(day.index, shiftType);
                    const assignments = assignmentsByCell.get(key) ?? [];
                    const unavailableEmployees = unavailableEmployeesByCell.get(key) ?? [];
                    return (
                      <div className="shift-cell" key={key}>
                        {currentUser.role === "MANAGER" ? (
                          assignmentPicker?.cellKey === key ? (
                            <ShiftWorkerPicker
                              employees={schedule.employees}
                              selectedEmployeeId={assignmentPicker.employeeId}
                              shiftLabel={`${day.label}, ${SHIFT_DEFINITIONS[shiftType].label}`}
                              assignedEmployeeIds={new Set(
                                assignments.map((assignment) => assignment.employeeId)
                              )}
                              getAvailabilityHint={(employeeId) =>
                                getAssignmentAvailabilityHint(
                                  schedule.scheduleAvailabilityBlocks,
                                  employeeId,
                                  day.index,
                                  shiftType
                                )
                              }
                              onSelect={(employeeId) =>
                                setAssignmentPicker({ cellKey: key, employeeId })
                              }
                              onSave={() => {
                                const employeeId = assignmentPicker.employeeId;
                                setAssignmentPicker(null);
                                const occupiedAssignment = assignments[0];
                                const selectedEmployee = employeesById.get(employeeId);
                                const occupiedEmployee = occupiedAssignment
                                  ? employeesById.get(occupiedAssignment.employeeId)
                                  : null;
                                if (occupiedAssignment) {
                                  setPendingReplacement({
                                    employeeId,
                                    employeeName: selectedEmployee?.name ?? "העובד החדש",
                                    dayIndex: day.index,
                                    shiftType,
                                    existingAssignmentId: occupiedAssignment.id,
                                    existingEmployeeName: occupiedEmployee?.name ?? "העובד הקיים"
                                  });
                                  return;
                                }
                                void assignShift(employeeId, day.index, shiftType);
                              }}
                              onClose={() => setAssignmentPicker(null)}
                            />
                          ) : (
                            <button
                              className="add-shift"
                              data-pdf-hide="true"
                              onClick={() => setAssignmentPicker({ cellKey: key, employeeId: "" })}
                            >
                              {assignments.length > 0 ? <Repeat2 size={16} /> : <Plus size={16} />}
                              {assignments.length > 0 ? "החלפת עובד" : "שיבוץ"}
                            </button>
                          )
                        ) : (
                          <div className="employee-shift-state" data-pdf-hide="true">שיבוץ מנהלת</div>
                        )}
                        {unavailableEmployees.length > 0 ? (
                          <div
                            className="cell-unavailable"
                            aria-label={`לא זמינים: ${unavailableEmployees
                              .map((employee) => employee.name)
                              .join(", ")}`}
                          >
                            <strong><ShieldAlert size={13} /> לא זמינים</strong>
                            <div className="cell-unavailable-names">
                              {unavailableEmployees.map((employee) => (
                                <span key={employee.id} style={employeeColorStyle(employee)}>
                                  <i className="employee-color-dot" aria-hidden="true" />
                                  {employee.name}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        <div className="assigned-list">
                          {assignments
                            .filter((assignment) => matchingEmployeeIds.has(assignment.employeeId))
                            .map((assignment) => {
                            const employee = employeesById.get(assignment.employeeId);
                            return (
                            <div
                              className="employee-chip"
                              key={assignment.id}
                              style={shiftColorStyle(assignment.shiftType)}
                            >
                              <span>
                                <i className="employee-color-dot" aria-hidden="true" />
                                {isUnavailableForShift(
                                  schedule.scheduleAvailabilityBlocks,
                                  assignment.employeeId,
                                  day.index,
                                  shiftType
                                ) ? (
                                  <ShieldAlert
                                    className="assignment-warning"
                                    size={14}
                                    aria-label="שובץ בניגוד לאילוץ"
                                  />
                                ) : null}
                                {employee?.name ?? "עובד"}
                              </span>
                              {currentUser.role === "MANAGER" ? (
                                <button
                                  data-pdf-hide="true"
                                  disabled={Boolean(assignmentRemoval.pending)}
                                  onClick={() => stageAssignmentRemoval(assignment)}
                                  title="הסר שיבוץ"
                                >
                                  <X size={14} />
                                </button>
                              ) : null}
                            </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            <aside className="side-panel">
              <section className="summary-block" id="employees-section">
                <div className="panel-title-row">
                  <div className="panel-title">
                    <UsersRound size={18} />
                    <h2>סיכום עובדים</h2>
                  </div>
                  {currentUser.role === "MANAGER" ? (
                    <button
                      type="button"
                      className="employee-add-button"
                      title="הוספת עובד"
                      onClick={() => setEmployeeEditor({ mode: "create", employee: null })}
                    >
                      <UserPlus size={17} />
                      הוספה
                    </button>
                  ) : null}
                </div>
                <div className="summary-list">
                  {schedule.summaries
                    .filter((summary) => matchingEmployeeIds.has(summary.employeeId))
                    .map((summary) => {
                    const employee = employeesById.get(summary.employeeId);
                    return (
                      <div
                        className="summary-item"
                        key={summary.employeeId}
                        style={employeeColorStyle(employee)}
                      >
                        <div className="summary-copy">
                          <strong className="employee-name-with-color">
                            <i className="employee-color-dot" aria-hidden="true" />
                            {employee?.name}
                          </strong>
                          <span>
                            {summary.shiftCount}/{summary.maxShifts} משמרות
                          </span>
                        </div>
                        <div className="summary-meta">
                          <b>{summary.workHours} שעות</b>
                          {currentUser.role === "MANAGER" && employee ? (
                            <div className="summary-controls">
                              <button
                                type="button"
                                title={`עריכת ${employee.name}`}
                                onClick={() => setEmployeeEditor({ mode: "edit", employee })}
                              >
                                <Pencil size={15} />
                              </button>
                              <button
                                type="button"
                                className="delete"
                                title={`מחיקת ${employee.name}`}
                                onClick={() => setEmployeeToDelete(employee)}
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                  {matchingEmployeeIds.size === 0 ? <p className="empty-state">לא נמצאו עובדים.</p> : null}
                </div>
              </section>

              <section className="summary-block" id="swaps-section">
                <div className="panel-title">
                  <Repeat2 size={18} />
                  <h2>החלפות</h2>
                </div>
                <form className="compact-form" ref={swapFormRef} onSubmit={createSwap}>
                  <select name="requesterAssignmentId" required defaultValue="">
                    <option value="" disabled>
                      משמרת מקור
                    </option>
                    {swapSourceAssignments.map((assignment) => (
                      <option value={assignment.id} key={assignment.id}>
                        {employeesById.get(assignment.employeeId)?.name} · יום {assignment.dayIndex + 1} ·{" "}
                        {SHIFT_DEFINITIONS[assignment.shiftType].label}
                      </option>
                    ))}
                  </select>
                  <select name="targetEmployeeId" required defaultValue="">
                    <option value="" disabled>
                      עובד יעד
                    </option>
                    {schedule.employees.map((employee) => (
                      <option value={employee.id} key={employee.id}>
                        {employee.name}
                      </option>
                    ))}
                  </select>
                  <button className="primary-button" disabled={swapSourceAssignments.length === 0}>
                    {swapSourceAssignments.length === 0 ? "אין משמרת להחלפה" : "שלח החלפה"}
                  </button>
                </form>
                <h3 className="swap-section-title">בקשות פעילות</h3>
                <SwapRequestList
                  swaps={activeSwaps}
                  ownEmployeeId={ownEmployee?.id}
                  isManager={currentUser.role === "MANAGER"}
                  onDecision={decideSwap}
                  emptyLabel="אין בקשות פעילות."
                />
                <h3 className="swap-section-title">היסטוריית החלפות</h3>
                <SwapRequestList
                  swaps={swapHistory}
                  ownEmployeeId={ownEmployee?.id}
                  isManager={currentUser.role === "MANAGER"}
                  onDecision={decideSwap}
                  emptyLabel="עדיין אין החלפות שהסתיימו."
                />
              </section>
            </aside>
          </section>

          <AvailabilityPanel
            currentUser={currentUser}
            weekStart={initialAvailabilityWeekStart}
            days={availabilityDays}
            employees={schedule.employees}
            visibleEmployees={availabilityView.visibleEmployees}
            selectedEmployeeIds={availabilityView.selection}
            selectedEmployeeCount={availabilityView.selectedEmployees.length}
            page={availabilityView.page}
            pageCount={availabilityView.pageCount}
            pageSize={availabilityPageSize}
            availabilityBlocks={schedule.availabilityBlocks}
            isFilterOpen={isAvailabilityFilterOpen}
            onOpenFilter={openAvailabilityFilter}
            onCloseFilter={closeAvailabilityFilter}
            onToggleEmployee={availabilityView.toggleEmployee}
            onToggleAll={availabilityView.toggleAll}
            onPreviousPage={availabilityView.previousPage}
            onNextPage={availabilityView.nextPage}
            onSetShiftAvailability={setShiftAvailability}
            onToggleTimeOff={toggleTimeOff}
          />

          <footer className="bottom-summary">
            <div>
              <Clock3 size={18} />
              {schedule.summaries.reduce((sum, item) => sum + item.workHours, 0)} שעות
            </div>
            <div>
              <CalendarDays size={18} />
              {schedule.assignments.length} משמרות
            </div>
            <div>
              <UsersRound size={18} />
              {schedule.employees.length} עובדים
            </div>
            <div>
              <MessageSquare size={18} />
              {schedule.swaps.length} החלפות
            </div>
          </footer>
        </main>
      </div>

      {toast ? (
        <button className="toast" onClick={() => setToast("")}>
          {toast}
        </button>
      ) : null}
      {assignmentRemoval.pending ? (
        <AssignmentUndoToast
          employeeName={employeesById.get(assignmentRemoval.pending.employeeId)?.name ?? "העובד"}
          secondsLeft={assignmentRemoval.secondsLeft}
          durationMs={ASSIGNMENT_UNDO_DURATION_MS}
          onUndo={assignmentRemoval.undo}
        />
      ) : null}
      {pendingReplacement ? (
        <div className="modal-backdrop" role="presentation">
          <section
            className="warning-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="replacement-title"
          >
            <div className="warning-dialog-icon"><Repeat2 size={22} /></div>
            <div>
              <h2 id="replacement-title">אישור החלפת עובד</h2>
              <p className="dialog-copy">
                המשמרת כבר מאוישת על ידי <strong>{pendingReplacement.existingEmployeeName}</strong>.
                {" "}להחליף אותו ב־<strong>{pendingReplacement.employeeName}</strong>?
              </p>
            </div>
            <div className="warning-dialog-actions">
              <button className="soft-action" onClick={() => setPendingReplacement(null)}>
                ביטול
              </button>
              <button
                className="warning-action"
                onClick={() => {
                  const replacement = pendingReplacement;
                  setPendingReplacement(null);
                  void assignShift(
                    replacement.employeeId,
                    replacement.dayIndex,
                    replacement.shiftType,
                    false,
                    replacement.existingAssignmentId
                  );
                }}
              >
                החלף עובד
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {pendingAssignment ? (
        <div className="modal-backdrop" role="presentation">
          <section className="warning-dialog" role="dialog" aria-modal="true" aria-labelledby="warning-title">
            <div className="warning-dialog-icon"><AlertTriangle size={22} /></div>
            <div>
              <h2 id="warning-title">נדרש אישור חריגה</h2>
              <ul>
                {pendingAssignment.warnings.map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
            </div>
            <div className="warning-dialog-actions">
              <button className="soft-action" onClick={() => setPendingAssignment(null)}>ביטול</button>
              <button
                className="warning-action"
                onClick={() =>
                  assignShift(
                    pendingAssignment.employeeId,
                    pendingAssignment.dayIndex,
                    pendingAssignment.shiftType,
                    true,
                    pendingAssignment.replaceAssignmentId
                  )
                }
              >
                שיבוץ בכל זאת
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {pendingSwap ? (
        <div className="modal-backdrop" role="presentation">
          <section
            className="warning-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="swap-warning-title"
          >
            <div className="warning-dialog-icon"><AlertTriangle size={22} /></div>
            <div>
              <h2 id="swap-warning-title">אזהרת משמרות רצופות (8–8)</h2>
              <p className="dialog-copy">
                ההחלפה עלולה ליצור משמרת אחרי משמרת או מנוחה של 8 שעות בלבד.
              </p>
              <ul>
                {pendingSwap.warnings.map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
            </div>
            <div className="warning-dialog-actions">
              <button className="soft-action" onClick={() => setPendingSwap(null)}>ביטול</button>
              <button
                className="warning-action"
                onClick={() => submitSwap(pendingSwap.submission, true)}
              >
                שלח בכל זאת
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {employeeEditor ? (
        <EmployeeEditorDialog
          key={`${employeeEditor.mode}-${employeeEditor.employee?.id ?? "new"}`}
          editor={employeeEditor}
          isSaving={isSavingEmployee}
          onClose={() => setEmployeeEditor(null)}
          onSubmit={saveEmployee}
        />
      ) : null}
      {employeeToDelete ? (
        <div className="modal-backdrop" role="presentation">
          <section className="warning-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-title">
            <div className="warning-dialog-icon delete-dialog-icon"><Trash2 size={21} /></div>
            <div>
              <h2 id="delete-title">מחיקת {employeeToDelete.name}</h2>
              <p className="dialog-copy">
                המחיקה תסיר גם את השיבוצים, האילוצים ובקשות ההחלפה המשויכים לעובד.
              </p>
            </div>
            <div className="warning-dialog-actions">
              <button className="soft-action" onClick={() => setEmployeeToDelete(null)}>ביטול</button>
              <button className="delete-action" onClick={deleteEmployee}>מחיקת עובד</button>
            </div>
          </section>
        </div>
      ) : null}
      {isLoading ? <div className="loading-bar" /> : null}
    </div>
  );
}

function SwapRequestList({
  swaps,
  ownEmployeeId,
  isManager,
  onDecision,
  emptyLabel
}: {
  swaps: ShiftSwapRequest[];
  ownEmployeeId?: string;
  isManager: boolean;
  onDecision: (id: string, action: string) => Promise<void>;
  emptyLabel: string;
}) {
  if (swaps.length === 0) {
    return <p className="swap-empty">{emptyLabel}</p>;
  }

  return (
    <div className="swap-list">
      {swaps.map((swap) => {
        const employeeCanDecide =
          swap.status === "PENDING_EMPLOYEE" &&
          swap.targetEmployeeId === ownEmployeeId &&
          !swap.employeeDecidedAt;
        const managerCanDecide =
          isManager &&
          (swap.status === "PENDING_EMPLOYEE" || swap.status === "PENDING_MANAGER") &&
          !swap.managerDecidedAt;
        const decisionActor = managerCanDecide ? "manager" : employeeCanDecide ? "employee" : null;
        return (
          <article className="swap-item" key={swap.id}>
            <div className="swap-copy">
              <strong className="swap-route">
                {swap.requesterEmployeeName ?? "עובד"}
                <Repeat2 size={14} aria-hidden="true" />
                {swap.targetEmployeeName ?? "עובד יעד"}
              </strong>
              <span>{swapShiftLabel(swap)}</span>
              <small className="swap-created">נשלחה {formatSwapCreatedAt(swap.createdAt)}</small>
            </div>
            <div className="swap-meta">
              <span className={`swap-status ${swap.status.toLocaleLowerCase()}`}>
                {swapStatusLabel(swap)}
              </span>
              {decisionActor ? (
                <div className="swap-actions">
                  <button
                    type="button"
                    title={decisionActor === "manager" ? "אישור מנהלת" : "אישור עובד"}
                    aria-label={decisionActor === "manager" ? "אישור מנהלת להחלפה" : "אישור עובד להחלפה"}
                    onClick={() => onDecision(
                      swap.id,
                      `approve_${decisionActor}`
                    )}
                  >
                    <Check size={14} />
                    <span>{decisionActor === "manager" ? "אישור מנהלת" : "אישור עובד"}</span>
                  </button>
                  <button
                    type="button"
                    className="decline"
                    title={decisionActor === "manager" ? "סירוב מנהלת" : "סירוב עובד"}
                    aria-label={decisionActor === "manager" ? "סירוב מנהלת להחלפה" : "סירוב עובד להחלפה"}
                    onClick={() => onDecision(
                      swap.id,
                      `decline_${decisionActor}`
                    )}
                  >
                    <X size={14} />
                    <span>{decisionActor === "manager" ? "סירוב מנהלת" : "סירוב עובד"}</span>
                  </button>
                </div>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function groupUnavailableEmployees(
  employees: Employee[],
  availabilityBlocks: AvailabilityBlock[]
) {
  const groups = new Map<string, Employee[]>();
  for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
    for (const shiftType of getShiftTypes()) {
      const unavailableEmployees = employees.filter((employee) =>
        isUnavailableForShift(availabilityBlocks, employee.id, dayIndex, shiftType)
      );
      if (unavailableEmployees.length > 0) {
        groups.set(cellKey(dayIndex, shiftType), unavailableEmployees);
      }
    }
  }
  return groups;
}

function groupAssignments(assignments: ShiftAssignment[]) {
  const groups = new Map<string, ShiftAssignment[]>();
  for (const assignment of assignments) {
    const key = cellKey(assignment.dayIndex, assignment.shiftType);
    groups.set(key, [...(groups.get(key) ?? []), assignment]);
  }
  return groups;
}

function removeAssignmentFromSchedule(
  schedule: SchedulePayload,
  assignment: ShiftAssignment
): SchedulePayload {
  if (!schedule.assignments.some((item) => item.id === assignment.id)) {
    return schedule;
  }
  return {
    ...schedule,
    assignments: schedule.assignments.filter((item) => item.id !== assignment.id),
    summaries: adjustEmployeeSummary(schedule.summaries, assignment.employeeId, -1)
  };
}

function restoreAssignmentInSchedule(
  schedule: SchedulePayload,
  assignment: ShiftAssignment
): SchedulePayload {
  if (
    schedule.weekStart.slice(0, 10) !== assignment.weekStart.slice(0, 10) ||
    schedule.assignments.some((item) => item.id === assignment.id)
  ) {
    return schedule;
  }
  return {
    ...schedule,
    assignments: [...schedule.assignments, assignment],
    summaries: adjustEmployeeSummary(schedule.summaries, assignment.employeeId, 1)
  };
}

function hidePendingAssignmentRemovals(
  schedule: SchedulePayload,
  pendingRemovals: ReadonlyMap<string, ShiftAssignment>
) {
  return [...pendingRemovals.values()].reduce(removeAssignmentFromSchedule, schedule);
}

function adjustEmployeeSummary(
  summaries: EmployeeSummary[],
  employeeId: string,
  shiftDelta: number
) {
  return summaries.map((summary) =>
    summary.employeeId === employeeId
      ? {
          ...summary,
          shiftCount: Math.max(0, summary.shiftCount + shiftDelta),
          workHours: Math.max(0, summary.workHours + shiftDelta * 8)
        }
      : summary
  );
}

function cellKey(dayIndex: number, shiftType: ShiftType) {
  return `${dayIndex}-${shiftType}`;
}

function employeeColorStyle(employee: Employee | undefined): CSSProperties {
  const color = getEmployeeColor(employee?.userId ?? employee?.id ?? "unassigned");
  return {
    "--employee-color": color.solid,
    "--employee-soft": color.soft
  } as CSSProperties;
}

function shiftColorStyle(shiftType: ShiftType): CSSProperties {
  const color = SHIFT_DEFINITIONS[shiftType].color;
  return {
    "--employee-color": color.solid,
    "--employee-soft": color.soft
  } as CSSProperties;
}

function swapStatusLabel(swap: ShiftSwapRequest) {
  const labels = {
    DECLINED_BY_EMPLOYEE: "נדחה על ידי עובד",
    DECLINED_BY_MANAGER: "נדחה על ידי מנהלת",
    SUPERSEDED: "נסגרה כי השיבוץ כבר עודכן",
    APPROVED: "אושר"
  };
  if (swap.status === "PENDING_EMPLOYEE") {
    return swap.managerDecidedAt
      ? "המנהלת אישרה · ממתין לאישור עובד"
      : "ממתין לאישור עובד ולמנהלת";
  }
  if (swap.status === "PENDING_MANAGER") {
    return "העובד אישר · ממתין לאישור מנהלת";
  }
  return labels[swap.status];
}

function swapDecisionMessage(swap: ShiftSwapRequest) {
  if (swap.status === "APPROVED") {
    return "ההחלפה אושרה והשיבוץ בלוח עודכן אוטומטית.";
  }
  if (swap.status === "DECLINED_BY_EMPLOYEE" || swap.status === "DECLINED_BY_MANAGER") {
    return "ההחלפה נדחתה והועברה להיסטוריה.";
  }
  if (swap.status === "SUPERSEDED") {
    return "הבקשה הכפולה נסגרה כי השיבוץ כבר עודכן.";
  }
  return swapStatusLabel(swap);
}

function swapShiftLabel(swap: ShiftSwapRequest) {
  if (swap.weekStart === undefined || swap.dayIndex === undefined || !swap.shiftType) {
    return "פרטי המשמרת אינם זמינים";
  }
  const source = `${formatHebrewDate(addDays(swap.weekStart, swap.dayIndex))} · ${
    SHIFT_DEFINITIONS[swap.shiftType].label
  }`;
  if (swap.targetDayIndex === null || swap.targetDayIndex === undefined || !swap.targetShiftType) {
    return source;
  }
  return `${source} תמורת ${formatHebrewDate(addDays(swap.weekStart, swap.targetDayIndex))} · ${
    SHIFT_DEFINITIONS[swap.targetShiftType].label
  }`;
}

function formatSwapCreatedAt(createdAt: string) {
  return new Intl.DateTimeFormat("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(createdAt));
}
