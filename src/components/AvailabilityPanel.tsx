"use client";

import { ChevronLeft, ChevronRight, ShieldAlert, UsersRound } from "lucide-react";
import { memo, type CSSProperties } from "react";
import { AvailabilityEmployeeFilter } from "./AvailabilityEmployeeFilter";
import { findShiftAvailability, findTimeOff } from "@/lib/availability";
import { formatHebrewDate, type ScheduleDay } from "@/lib/dates";
import { getEmployeeColor } from "@/lib/employeeColors";
import { SHIFT_DEFINITIONS, getShiftTypes } from "@/lib/shifts";
import type {
  AvailabilityBlock,
  AvailabilityStatus,
  Employee,
  ShiftType,
  User
} from "@/lib/types";

interface AvailabilityPanelProps {
  currentUser: User;
  weekStart: string;
  days: ScheduleDay[];
  employees: Employee[];
  visibleEmployees: Employee[];
  selectedEmployeeIds: Set<string>;
  selectedEmployeeCount: number;
  page: number;
  pageCount: number;
  pageSize: number;
  availabilityBlocks: AvailabilityBlock[];
  isFilterOpen: boolean;
  onOpenFilter: () => void;
  onCloseFilter: () => void;
  onToggleEmployee: (employeeId: string) => void;
  onToggleAll: (selected: boolean) => void;
  onPreviousPage: () => void;
  onNextPage: () => void;
  onSetShiftAvailability: (
    employeeId: string,
    dayIndex: number,
    shiftType: ShiftType,
    status: AvailabilityStatus | "AVAILABLE"
  ) => void;
  onToggleTimeOff: (employeeId: string, dayIndex: number) => void;
}

export const AvailabilityPanel = memo(function AvailabilityPanel({
  currentUser,
  weekStart,
  days,
  employees,
  visibleEmployees,
  selectedEmployeeIds,
  selectedEmployeeCount,
  page,
  pageCount,
  pageSize,
  availabilityBlocks,
  isFilterOpen,
  onOpenFilter,
  onCloseFilter,
  onToggleEmployee,
  onToggleAll,
  onPreviousPage,
  onNextPage,
  onSetShiftAvailability,
  onToggleTimeOff
}: AvailabilityPanelProps) {
  const firstVisible = selectedEmployeeCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastVisible = Math.min(page * pageSize, selectedEmployeeCount);

  return (
    <section className="availability-panel" id="availability-section">
      <div className="availability-heading">
        <div className="panel-title">
          <ShieldAlert size={18} />
          <div className="availability-title">
            <h2>אילוצים שבועיים</h2>
            <span>
              לשבוע {formatHebrewDate(weekStart)}–{formatHebrewDate(days[6].date)} · שבועיים קדימה
            </span>
          </div>
        </div>
        <div className="availability-heading-actions">
          <div className="availability-legend">
            <span className="legend-morning">בוקר</span>
            <span className="legend-evening">ערב</span>
            <span className="legend-night">לילה</span>
            <span className="legend-time-off">חופש</span>
            <span className="legend-unavailable">לא זמין</span>
            <span className="legend-preferred">מעוניין לעבוד</span>
            <span className="legend-open">משמרת פתוחה</span>
          </div>
          {currentUser.role === "MANAGER" ? (
            <button
              type="button"
              className="availability-filter-button"
              title="סינון עובדים"
              onClick={onOpenFilter}
            >
              <UsersRound size={16} />
              עובדים
              <b>{selectedEmployeeIds.size}</b>
            </button>
          ) : null}
        </div>
      </div>

      <div className="availability-scroll">
        <div className="availability-grid availability-header">
          <div>עובד</div>
          {days.map((day) => (
            <div key={day.index}>
              <strong>{day.label}</strong>
              <span>{formatHebrewDate(day.date)}</span>
            </div>
          ))}
        </div>
        {visibleEmployees.map((employee) => (
          <AvailabilityEmployeeRow
            currentUser={currentUser}
            days={days}
            employee={employee}
            availabilityBlocks={availabilityBlocks}
            onSetShiftAvailability={onSetShiftAvailability}
            onToggleTimeOff={onToggleTimeOff}
            key={employee.id}
          />
        ))}
        {visibleEmployees.length === 0 ? (
          <div className="availability-table-empty">
            לא נבחרו עובדים להצגה. ניתן לבחור עובדים דרך כפתור הסינון.
          </div>
        ) : null}
      </div>

      {currentUser.role === "MANAGER" && selectedEmployeeCount > 0 ? (
        <div className="availability-pagination">
          <span>מציג {firstVisible}-{lastVisible} מתוך {selectedEmployeeCount}</span>
          <nav aria-label="עמודי אילוצים">
            <button
              type="button"
              title="עמוד קודם"
              disabled={page === 1}
              onClick={onPreviousPage}
            >
              <ChevronRight size={16} />
            </button>
            <strong>עמוד {page} מתוך {pageCount}</strong>
            <button
              type="button"
              title="עמוד הבא"
              disabled={page === pageCount}
              onClick={onNextPage}
            >
              <ChevronLeft size={16} />
            </button>
          </nav>
        </div>
      ) : null}

      {isFilterOpen && currentUser.role === "MANAGER" ? (
        <AvailabilityEmployeeFilter
          employees={employees}
          selectedEmployeeIds={selectedEmployeeIds}
          onToggleEmployee={onToggleEmployee}
          onToggleAll={onToggleAll}
          onClose={onCloseFilter}
        />
      ) : null}
    </section>
  );
});

const AvailabilityEmployeeRow = memo(function AvailabilityEmployeeRow({
  currentUser,
  days,
  employee,
  availabilityBlocks,
  onSetShiftAvailability,
  onToggleTimeOff
}: Pick<
  AvailabilityPanelProps,
  "currentUser" | "days" | "availabilityBlocks" | "onSetShiftAvailability" | "onToggleTimeOff"
> & { employee: Employee }) {
  const canEdit =
    currentUser.role === "MANAGER" ||
    (currentUser.role === "EMPLOYEE" && employee.userId === currentUser.id);
  const color = getEmployeeColor(employee.userId ?? employee.id);
  const style = {
    "--employee-color": color.solid,
    "--employee-soft": color.soft
  } as CSSProperties;

  return (
    <div className="availability-grid availability-row" style={style}>
      <div className="availability-employee">
        <strong className="employee-name-with-color">
          <i className="employee-color-dot" aria-hidden="true" />
          {employee.name}
        </strong>
        <span>
          {currentUser.role === "EMPLOYEE" && canEdit ? "האילוצים שלי" : employee.roleTitle}
        </span>
      </div>
      {days.map((day) => {
        const timeOff = findTimeOff(availabilityBlocks, employee.id, day.index);
        return (
          <div className={`availability-day ${timeOff ? "is-time-off" : ""}`} key={day.index}>
            <button
              type="button"
              className={`time-off-toggle ${timeOff ? "active" : ""}`}
              aria-pressed={Boolean(timeOff)}
              disabled={!canEdit}
              onClick={() => onToggleTimeOff(employee.id, day.index)}
            >
              חופש
            </button>
            {getShiftTypes().map((shiftType) => {
              const availability = findShiftAvailability(
                availabilityBlocks,
                employee.id,
                day.index,
                shiftType
              );
              const value = availability?.status ?? "AVAILABLE";
              return (
                <label className={`availability-choice ${value.toLowerCase()}`} key={shiftType}>
                  <span>{SHIFT_DEFINITIONS[shiftType].label}</span>
                  <select
                    aria-label={`${employee.name}, ${day.label}, ${SHIFT_DEFINITIONS[shiftType].label}`}
                    value={value}
                    disabled={!canEdit || Boolean(timeOff)}
                    onChange={(event) =>
                      onSetShiftAvailability(
                        employee.id,
                        day.index,
                        shiftType,
                        event.target.value as AvailabilityStatus | "AVAILABLE"
                      )
                    }
                  >
                    <option value="AVAILABLE">פנוי</option>
                    <option value="PREFERRED">מעוניין</option>
                    <option value="UNAVAILABLE">לא זמין</option>
                  </select>
                </label>
              );
            })}
          </div>
        );
      })}
    </div>
  );
});
