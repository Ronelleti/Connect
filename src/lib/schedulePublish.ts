import { addDays, formatHebrewDate, getScheduleDays } from "./dates";
import { SHIFT_DEFINITIONS } from "./shifts";
import type { ShiftType } from "./types";

interface WeekShift {
  dayIndex: number;
  shiftType: ShiftType;
}

const SHIFT_ORDER: ShiftType[] = ["MORNING", "EVENING", "NIGHT"];

export function schedulePublishLink(weekStart: string) {
  return `/schedule?week=${weekStart}`;
}

// The notification each employee gets when a manager publishes (or re-publishes) a week:
// their own shifts for that week, in order.
export function buildSchedulePublishedMessage(weekStart: string, shifts: WeekShift[], isUpdate: boolean) {
  const days = getScheduleDays(weekStart);
  const range = `${formatHebrewDate(weekStart)}-${formatHebrewDate(addDays(weekStart, 6))}`;
  const sorted = [...shifts].sort(
    (left, right) =>
      left.dayIndex - right.dayIndex ||
      SHIFT_ORDER.indexOf(left.shiftType) - SHIFT_ORDER.indexOf(right.shiftType)
  );
  const list = sorted
    .map(
      (shift) =>
        `${days[shift.dayIndex].label} ${formatHebrewDate(days[shift.dayIndex].date)} ${
          SHIFT_DEFINITIONS[shift.shiftType].label
        }`
    )
    .join(", ");

  let body: string;
  if (sorted.length === 0) {
    body = "אין לך משמרות בשבוע זה.";
  } else if (sorted.length === 1) {
    body = `יש לך משמרת אחת: ${list}.`;
  } else {
    body = `יש לך ${sorted.length} משמרות: ${list}.`;
  }

  return {
    title: isUpdate ? `הסידור לשבוע ${range} עודכן` : `הסידור לשבוע ${range} מוכן`,
    body,
    link: schedulePublishLink(weekStart)
  };
}
