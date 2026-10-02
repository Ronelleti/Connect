import { addDays, getSundayWeekStart } from "@/lib/dates";
import { validateAssignment } from "@/lib/scheduling";
import type { Assignment, Issue, Person } from "@/lib/types";
import { findShiftTemplate } from "./org";
import { listUserAssignments } from "./schedule";

/**
 * Whether `assignment` can move to `person`: no overlap, enough rest, not a duplicate.
 * Shifts listed in `leaving` are about to move away from the person (an exchange), so
 * they don't count. Warnings (hours, availability) don't block a move the people agreed on.
 */
export async function moveErrors(assignment: Assignment, person: Person, leaving: string[] = []): Promise<Issue[]> {
  const template = await findShiftTemplate(assignment.shiftTemplateId);
  if (!template) {
    return [{ code: "MISSING", message: "המשמרת לא נמצאה." }];
  }
  const weekStart = getSundayWeekStart(new Date(`${assignment.workDate}T12:00:00.000Z`));
  const existing = (await listUserAssignments([person.id], addDays(weekStart, -1), addDays(weekStart, 8))).filter(
    (other) => !leaving.includes(other.id)
  );
  const validation = validateAssignment(
    {
      userId: person.id,
      // Moves keep the hours the shift was scheduled with, even if the shift was edited or archived since.
      template: { ...template, startsAt: assignment.startsAt, endsAt: assignment.endsAt, isActive: true, weekdays: 127 },
      workDate: assignment.workDate
    },
    person,
    existing,
    [],
    weekStart
  );
  return validation.errors;
}
