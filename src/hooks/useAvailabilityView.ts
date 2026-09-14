"use client";

import { useCallback, useMemo, useState } from "react";
import type { Employee } from "@/lib/types";

export function useAvailabilityView({
  employees,
  visibleEmployeeIds,
  pageSize,
  resetKey
}: {
  employees: Employee[];
  visibleEmployeeIds: Set<string>;
  pageSize: number;
  resetKey: string;
}) {
  // A null selection means all current employees, including employees added after initialization.
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[] | null>(null);
  const [pageState, setPageState] = useState({ page: 1, resetKey });
  const page = pageState.resetKey === resetKey ? pageState.page : 1;

  const selection = useMemo(() => {
    const currentIds = new Set(employees.map((employee) => employee.id));
    return new Set(
      (selectedEmployeeIds ?? [...currentIds]).filter((employeeId) => currentIds.has(employeeId))
    );
  }, [employees, selectedEmployeeIds]);

  const selectedEmployees = useMemo(
    () =>
      employees.filter(
        (employee) => selection.has(employee.id) && visibleEmployeeIds.has(employee.id)
      ),
    [employees, selection, visibleEmployeeIds]
  );
  const pageCount = Math.max(1, Math.ceil(selectedEmployees.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const visibleEmployees = useMemo(
    () => selectedEmployees.slice((safePage - 1) * pageSize, safePage * pageSize),
    [pageSize, safePage, selectedEmployees]
  );

  const toggleEmployee = useCallback((employeeId: string) => {
    setPageState({ page: 1, resetKey });
    setSelectedEmployeeIds((current) => {
      const selected = new Set(current ?? employees.map((employee) => employee.id));
      if (selected.has(employeeId)) {
        selected.delete(employeeId);
      } else {
        selected.add(employeeId);
      }
      return selected.size === employees.length ? null : [...selected];
    });
  }, [employees, resetKey]);

  const toggleAll = useCallback((selected: boolean) => {
    setPageState({ page: 1, resetKey });
    setSelectedEmployeeIds(selected ? null : []);
  }, [resetKey]);

  const previousPage = useCallback(
    () => setPageState((current) => ({ page: Math.max(1, current.page - 1), resetKey })),
    [resetKey]
  );
  const nextPage = useCallback(
    () => setPageState((current) => ({ page: Math.min(pageCount, current.page + 1), resetKey })),
    [pageCount, resetKey]
  );

  return {
    selection,
    selectedEmployees,
    visibleEmployees,
    page: safePage,
    pageCount,
    previousPage,
    nextPage,
    toggleEmployee,
    toggleAll
  };
}
