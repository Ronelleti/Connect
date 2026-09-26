import { addDays, formatHebrewDate } from "@/lib/dates";
import { SHIFT_DEFINITIONS } from "@/lib/shifts";
import type { ShiftSwapRequest } from "@/lib/types";
import { findUserIdForEmployee, listManagerUserIds, notifyUsers } from "./notifications";
import { findSwapRequest, type SwapDecisionAction } from "./repositories";

const SWAPS_LINK = "/schedule#swaps-section";

function describeSwapShift(swap: ShiftSwapRequest): string {
  if (!swap.weekStart || swap.dayIndex === undefined || !swap.shiftType) {
    return "המשמרת";
  }
  return `משמרת ${SHIFT_DEFINITIONS[swap.shiftType].label} ב-${formatHebrewDate(
    addDays(swap.weekStart, swap.dayIndex)
  )}`;
}

// The target's shift in a two-way swap, or null when the requester only hands theirs over.
function describeTargetShift(swap: ShiftSwapRequest): string | null {
  if (!swap.weekStart || swap.targetDayIndex == null || !swap.targetShiftType) {
    return null;
  }
  return `משמרת ${SHIFT_DEFINITIONS[swap.targetShiftType].label} ב-${formatHebrewDate(
    addDays(swap.weekStart, swap.targetDayIndex)
  )}`;
}

// A new request goes to the employee being asked to swap.
export async function notifySwapRequested(created: ShiftSwapRequest) {
  // Reload so the names and shift details (joined columns) are present.
  const swap = (await findSwapRequest(created.id)) ?? created;
  await notifyUsers([await findUserIdForEmployee(swap.targetEmployeeId)], {
    title: "בקשת החלפת משמרת",
    body: describeTargetShift(swap)
      ? `${swap.requesterEmployeeName ?? "עובד/ת"} מבקש/ת להחליף: ${describeSwapShift(swap)} שלו/ה תמורת ${describeTargetShift(swap)} שלך. יש לאשר או לדחות.`
      : `${swap.requesterEmployeeName ?? "עובד/ת"} מבקש/ת להעביר אליך את ${describeSwapShift(swap)}. יש לאשר או לדחות.`,
    link: SWAPS_LINK
  });
}

// After each decision, tells the people involved what happened and who acts next:
// once the target employee accepts, the managers are asked to approve; once the manager
// approves (or declines), both employees hear about it.
export async function notifySwapDecision(decided: ShiftSwapRequest, action: SwapDecisionAction) {
  const swap = (await findSwapRequest(decided.id)) ?? decided;
  const [requesterUserId, targetUserId] = await Promise.all([
    findUserIdForEmployee(swap.requesterEmployeeId),
    findUserIdForEmployee(swap.targetEmployeeId)
  ]);
  const requesterName = swap.requesterEmployeeName ?? "העובד/ת המבקש/ת";
  const targetName = swap.targetEmployeeName ?? "העובד/ת";
  const shift = describeSwapShift(swap);
  const targetShift = describeTargetShift(swap);

  if (swap.status === "APPROVED") {
    await notifyUsers([requesterUserId], {
      title: "ההחלפה אושרה",
      body: targetShift
        ? `המנהל אישר את ההחלפה עם ${targetName}: ${shift} עברה ל${targetName}, ו${targetShift} עכשיו שלך.`
        : `המנהל אישר את ההחלפה. ${shift} עברה ל${targetName}.`,
      link: SWAPS_LINK
    });
    await notifyUsers([targetUserId], {
      title: "ההחלפה אושרה",
      body: targetShift
        ? `המנהל אישר את ההחלפה עם ${requesterName}: ${shift} עכשיו שלך, ו${targetShift} עברה ל${requesterName}.`
        : `המנהל אישר את ההחלפה עם ${requesterName}. ${shift} שלך עכשיו.`,
      link: SWAPS_LINK
    });
    return;
  }

  if (swap.status === "PENDING_MANAGER" && action === "approve_employee") {
    await notifyUsers([requesterUserId], {
      title: "ההחלפה אושרה על ידי העובד/ת",
      body: `${targetName} הסכים/ה להחליף איתך את ${shift}. הבקשה ממתינה לאישור המנהל.`,
      link: SWAPS_LINK
    });
    await notifyUsers(await listManagerUserIds(), {
      title: "החלפת משמרת ממתינה לאישורך",
      body: `${requesterName} ו${targetName} הסכימו להחליף את ${shift}.`,
      link: SWAPS_LINK
    });
    return;
  }

  if (swap.status === "DECLINED_BY_EMPLOYEE") {
    await notifyUsers([requesterUserId], {
      title: "בקשת ההחלפה נדחתה",
      body: `${targetName} לא הסכים/ה להחליף את ${shift}.`,
      link: SWAPS_LINK
    });
    return;
  }

  if (swap.status === "DECLINED_BY_MANAGER") {
    await notifyUsers([requesterUserId, targetUserId], {
      title: "המנהל דחה את ההחלפה",
      body: `בקשת ההחלפה בין ${requesterName} ל${targetName} (${shift}) נדחתה.`,
      link: SWAPS_LINK
    });
  }
}
