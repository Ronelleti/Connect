"use client";

import { Check, Save, X } from "lucide-react";
import type { CSSProperties } from "react";
import { getEmployeeColor } from "@/lib/employeeColors";
import type { Employee } from "@/lib/types";

export function ShiftWorkerPicker({
  employees,
  selectedEmployeeId,
  shiftLabel,
  assignedEmployeeIds,
  getAvailabilityHint,
  onSelect,
  onSave,
  onClose
}: {
  employees: Employee[];
  selectedEmployeeId: string;
  shiftLabel: string;
  assignedEmployeeIds: Set<string>;
  getAvailabilityHint: (employeeId: string) => string;
  onSelect: (employeeId: string) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const selectedEmployee = employees.find((employee) => employee.id === selectedEmployeeId);

  return (
    <section
      className="shift-worker-picker"
      role="dialog"
      aria-label={`בחירת עובד עבור ${shiftLabel}`}
      data-pdf-hide="true"
    >
      <header className="worker-picker-header">
        <div>
          <span>שיבוץ משמרת</span>
          <strong>{shiftLabel}</strong>
        </div>
        <button type="button" title="סגירת בחירת עובד" onClick={onClose}>
          <X size={16} />
        </button>
      </header>

      <div className="worker-option-list" role="listbox" aria-label="רשימת עובדים">
        {employees.map((employee) => {
          const isAssigned = assignedEmployeeIds.has(employee.id);
          const availabilityHint = getAvailabilityHint(employee.id);
          const isSelected = employee.id === selectedEmployeeId;
          return (
            <button
              type="button"
              role="option"
              aria-selected={isSelected}
              aria-label={`${employee.name}${isAssigned ? ", כבר משובץ" : availabilityHint ? `, ${availabilityHint}` : ""}`}
              className={`worker-option ${isSelected ? "selected" : ""}`}
              style={{ "--employee-color": getEmployeeColor(employee.id) } as CSSProperties}
              disabled={isAssigned}
              onClick={() => onSelect(employee.id)}
              key={employee.id}
            >
              <span className="worker-option-avatar" aria-hidden="true">
                {employee.name.trim().charAt(0)}
              </span>
              <span className="worker-option-copy">
                <strong>{employee.name}</strong>
                <small>{employee.roleTitle}</small>
              </span>
              {isAssigned || availabilityHint ? (
                <span
                  className={`worker-status ${isAssigned ? "assigned" : availabilityHint === "לא זמין" ? "unavailable" : "preferred"}`}
                >
                  {isAssigned ? "משובץ" : availabilityHint}
                </span>
              ) : null}
              {isSelected ? <Check className="worker-selected-icon" size={17} /> : null}
            </button>
          );
        })}
      </div>

      <footer className="worker-picker-footer">
        <span>{selectedEmployee ? selectedEmployee.name : "לא נבחר עובד"}</span>
        <button
          type="button"
          className="picker-save"
          disabled={!selectedEmployeeId}
          onClick={onSave}
        >
          <Save size={15} />
          שמור
        </button>
      </footer>
    </section>
  );
}
