"use client";

import { Search, SlidersHorizontal, X } from "lucide-react";
import { useMemo, useState } from "react";
import { getEmployeeColor } from "@/lib/employeeColors";
import type { Employee } from "@/lib/types";

export function AvailabilityEmployeeFilter({
  employees,
  selectedEmployeeIds,
  onToggleEmployee,
  onToggleAll,
  onClose
}: {
  employees: Employee[];
  selectedEmployeeIds: Set<string>;
  onToggleEmployee: (employeeId: string) => void;
  onToggleAll: (selected: boolean) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const filteredEmployees = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("he");
    return employees.filter((employee) =>
      !normalizedQuery || [employee.name, employee.roleTitle]
        .some((value) => value.toLocaleLowerCase("he").includes(normalizedQuery))
    );
  }, [employees, query]);
  const allSelected = employees.length > 0 && selectedEmployeeIds.size === employees.length;
  const selectionActionLabel =
    selectedEmployeeIds.size === 1 ? "הצג עובד אחד" : `הצג ${selectedEmployeeIds.size} עובדים`;

  return (
    <>
      <button
        type="button"
        className="availability-filter-scrim"
        aria-label="סגירת סינון עובדים"
        onClick={onClose}
      />
      <aside
        className="availability-filter-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="availability-filter-title"
      >
        <header className="availability-filter-header">
          <div className="panel-title">
            <SlidersHorizontal size={18} />
            <div>
              <h3 id="availability-filter-title">סינון עובדים</h3>
              <span>{selectedEmployeeIds.size} מתוך {employees.length} נבחרו</span>
            </div>
          </div>
          <button type="button" className="icon-button" title="סגירה" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <div className="drawer-search">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="חיפוש לפי שם או תפקיד"
            aria-label="חיפוש עובדים באילוצים"
          />
        </div>

        <label className="employee-filter-option select-all-option">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={(event) => onToggleAll(event.target.checked)}
          />
          <span className="filter-avatar all-employees-avatar">
            <SlidersHorizontal size={16} />
          </span>
          <span>
            <strong>בחר הכל</strong>
            <small>הצגת כל העובדים בטבלה</small>
          </span>
        </label>

        <div className="employee-filter-list">
          {filteredEmployees.map((employee) => (
            <label className="employee-filter-option" key={employee.id}>
              <input
                type="checkbox"
                checked={selectedEmployeeIds.has(employee.id)}
                onChange={() => onToggleEmployee(employee.id)}
              />
              <span
                className="filter-avatar"
                style={{
                  borderColor: getEmployeeColor(employee.id).solid,
                  color: getEmployeeColor(employee.id).solid
                }}
                aria-hidden="true"
              >
                {employee.name.trim().charAt(0)}
              </span>
              <span>
                <strong>{employee.name}</strong>
                <small>{employee.roleTitle}</small>
              </span>
            </label>
          ))}
          {filteredEmployees.length === 0 ? (
            <p className="empty-state">לא נמצאו עובדים.</p>
          ) : null}
        </div>

        <footer className="availability-filter-footer">
          <button type="button" className="primary-button" onClick={onClose}>
            {selectionActionLabel}
          </button>
        </footer>
      </aside>
    </>
  );
}
