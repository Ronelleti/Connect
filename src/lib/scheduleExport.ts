import { formatHebrewDate } from "./dates";
import { dayLabel } from "./labels";
import { shiftHours } from "./shiftTime";
import type { Assignment, ShiftTemplate } from "./types";

function cell(value: string | number) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** UTF-8 CSV (with BOM, so Excel shows Hebrew) of a team's week: one row per assignment. */
export function buildScheduleCsv(
  assignments: Assignment[],
  templates: ShiftTemplate[],
  names: Map<string, string>
): string {
  const templateNames = new Map(templates.map((template) => [template.id, template.name]));
  const rows = [...assignments]
    .sort((a, b) => a.workDate.localeCompare(b.workDate) || a.startsAt.localeCompare(b.startsAt) || (names.get(a.userId) ?? "").localeCompare(names.get(b.userId) ?? "", "he"))
    .map((assignment) => [
      names.get(assignment.userId) ?? "",
      dayLabel(assignment.workDate),
      formatHebrewDate(assignment.workDate),
      templateNames.get(assignment.shiftTemplateId) ?? "",
      assignment.startsAt,
      assignment.endsAt,
      shiftHours(assignment.startsAt, assignment.endsAt)
    ]);
  const header = ["עובד/ת", "יום", "תאריך", "משמרת", "התחלה", "סיום", "שעות"];
  return "﻿" + [header, ...rows].map((row) => row.map(cell).join(",")).join("\r\n");
}
