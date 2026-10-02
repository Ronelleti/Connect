import { addDays, diffDays, formatHebrewDate, getScheduleDays } from "./dates";
import { timeRangeLabel } from "./shiftTime";

interface PublishedShift {
  workDate: string;
  shiftName: string;
  startsAt: string;
  endsAt: string;
}

export function schedulePublishLink(weekStart: string, teamId: string) {
  return `/schedule?week=${weekStart}&team=${teamId}`;
}

// The notification each team member gets when their team's week is published (or
// re-published): their own shifts that week, in order.
export function buildSchedulePublishedMessage(
  weekStart: string,
  teamId: string,
  teamName: string,
  shifts: PublishedShift[],
  isUpdate: boolean
) {
  const days = getScheduleDays(weekStart);
  const range = `${formatHebrewDate(weekStart)}-${formatHebrewDate(addDays(weekStart, 6))}`;
  const list = [...shifts]
    .sort((left, right) => left.workDate.localeCompare(right.workDate) || left.startsAt.localeCompare(right.startsAt))
    .map((shift) => {
      const day = days[diffDays(weekStart, shift.workDate)];
      return `${day.label} ${formatHebrewDate(shift.workDate)} ${shift.shiftName} ${timeRangeLabel(shift.startsAt, shift.endsAt)}`;
    })
    .join(", ");

  const body =
    shifts.length === 0
      ? "אין לך משמרות בשבוע זה."
      : shifts.length === 1
        ? `יש לך משמרת אחת: ${list}.`
        : `יש לך ${shifts.length} משמרות: ${list}.`;

  return {
    title: isUpdate ? `הסידור של ${teamName} לשבוע ${range} עודכן` : `הסידור של ${teamName} לשבוע ${range} מוכן`,
    body,
    link: schedulePublishLink(weekStart, teamId)
  };
}
