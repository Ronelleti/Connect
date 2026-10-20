import { addDays, formatHebrewDate } from "@/lib/dates";
import { SHIFT_DEFINITIONS } from "@/lib/shifts";
import type { ShiftType } from "@/lib/types";
import { query } from "./db";
import { findUserIdForEmployee, listManagerUserIds, notifyUsers } from "./notifications";
import type { ShiftGiveaway, VacationRequest } from "./requests";

const REQUESTS_LINK = "/requests";

export function describeShift(weekStart: string, dayIndex: number, shiftType: ShiftType) {
  return `משמרת ${SHIFT_DEFINITIONS[shiftType].label} ב-${formatHebrewDate(addDays(weekStart, dayIndex))}`;
}

function describeGiveawayShift(giveaway: ShiftGiveaway) {
  return describeShift(giveaway.weekStart, giveaway.dayIndex, giveaway.shiftType);
}

function describeDates(request: VacationRequest) {
  return request.startDate === request.endDate
    ? formatHebrewDate(request.startDate)
    : `${formatHebrewDate(request.startDate)}-${formatHebrewDate(request.endDate)}`;
}

// A new offer goes to every other active employee who can sign in.
export async function notifyGiveawayOffered(giveaway: ShiftGiveaway) {
  const rows = await query<{ user_id: string }>(
    `SELECT user_id FROM employees
     WHERE is_active AND user_id IS NOT NULL AND id <> $1`,
    [giveaway.offeredByEmployeeId]
  );
  await notifyUsers(
    rows.map((row) => row.user_id),
    {
      title: "משמרת זמינה למסירה",
      body: `${giveaway.offeredByName} מוסר/ת ${describeGiveawayShift(giveaway)}. רוצה לקחת אותה?`,
      link: REQUESTS_LINK
    }
  );
}

export async function notifyGiveawayTaken(giveaway: ShiftGiveaway) {
  const shift = describeGiveawayShift(giveaway);
  await notifyUsers([await findUserIdForEmployee(giveaway.offeredByEmployeeId)], {
    title: "מישהו רוצה לקחת את המשמרת שלך",
    body: `${giveaway.takenByName} ביקש/ה לקחת את ${shift}. הבקשה ממתינה לאישור המנהל.`,
    link: REQUESTS_LINK
  });
  await notifyUsers(await listManagerUserIds(), {
    title: "מסירת משמרת ממתינה לאישורך",
    body: `${giveaway.takenByName} רוצה לקחת את ${shift} של ${giveaway.offeredByName}.`,
    link: REQUESTS_LINK
  });
}

export async function notifyGiveawayDecided(giveaway: ShiftGiveaway) {
  const shift = describeGiveawayShift(giveaway);
  const [offeredByUserId, takenByUserId] = await Promise.all([
    findUserIdForEmployee(giveaway.offeredByEmployeeId),
    findUserIdForEmployee(giveaway.takenByEmployeeId)
  ]);

  if (giveaway.status === "APPROVED") {
    await notifyUsers([offeredByUserId], {
      title: "מסירת המשמרת אושרה",
      body: `המנהל אישר למסור את המשמרת שלך (${shift}) ל${giveaway.takenByName}.`,
      link: REQUESTS_LINK
    });
    await notifyUsers([takenByUserId], {
      title: "קיבלת את המשמרת",
      body: `המנהל אישר לך לקחת את ${shift} מ${giveaway.offeredByName}.`,
      link: REQUESTS_LINK
    });
    return;
  }

  if (giveaway.status === "DECLINED_BY_MANAGER") {
    await notifyUsers([offeredByUserId, takenByUserId], {
      title: "המנהל לא אישר את מסירת המשמרת",
      body: `מסירת ${shift} מ${giveaway.offeredByName} ל${giveaway.takenByName} לא אושרה.`,
      link: REQUESTS_LINK
    });
    return;
  }

  if (giveaway.status === "CANCELLED" && takenByUserId) {
    await notifyUsers([takenByUserId], {
      title: "מסירת המשמרת בוטלה",
      body: `${giveaway.offeredByName} ביטל/ה את מסירת ${shift}.`,
      link: REQUESTS_LINK
    });
  }
}

export async function notifyVacationRequested(request: VacationRequest) {
  await notifyUsers(await listManagerUserIds(), {
    title: "בקשת חופשה חדשה",
    body: `${request.employeeName} מבקש/ת חופשה: ${describeDates(request)}.`,
    link: REQUESTS_LINK
  });
}

export async function notifyVacationDecided(request: VacationRequest) {
  const userId = await findUserIdForEmployee(request.employeeId);
  if (request.status === "APPROVED") {
    const removed =
      request.removedShiftCount > 0
        ? ` ${request.removedShiftCount} משמרות שלך בימים אלה הוסרו מהסידור.`
        : "";
    await notifyUsers([userId], {
      title: "בקשת החופשה אושרה",
      body: `החופשה שלך (${describeDates(request)}) אושרה.${removed}`,
      link: REQUESTS_LINK
    });
  } else if (request.status === "DECLINED") {
    await notifyUsers([userId], {
      title: "בקשת החופשה נדחתה",
      body: `בקשת החופשה שלך (${describeDates(request)}) לא אושרה.`,
      link: REQUESTS_LINK
    });
  }
}
