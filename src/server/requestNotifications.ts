import { dateRangeLabel, shiftLabel } from "@/lib/labels";
import type { Giveaway, SwapRequest, Team, VacationRequest } from "@/lib/types";
import { listUserIdsWithPermission } from "./access";
import { notifyUsers } from "./notifications";

const REQUESTS_LINK = "/requests";

function giveawayShift(giveaway: Giveaway) {
  return shiftLabel(giveaway.workDate, giveaway.shiftName, giveaway.startsAt, giveaway.endsAt);
}

export async function notifySwapRequested(swap: SwapRequest) {
  await notifyUsers([swap.targetUserId], {
    title: "בקשת החלפת משמרת",
    body: swap.targetShiftLabel
      ? `${swap.requesterName} מבקש/ת להחליף: ${swap.shiftLabel} שלו/ה תמורת ${swap.targetShiftLabel} שלך.`
      : `${swap.requesterName} מבקש/ת להעביר אליך: ${swap.shiftLabel}.`,
    link: REQUESTS_LINK
  });
}

export async function notifySwapUpdated(swap: SwapRequest, team: Team) {
  switch (swap.status) {
    case "PENDING_MANAGER":
      await notifyUsers([swap.requesterId], {
        title: "העמית/ה הסכים/ה להחלפה",
        body: `${swap.targetUserName} הסכים/ה (${swap.shiftLabel}). ממתין לאישור.`,
        link: REQUESTS_LINK
      });
      await notifyUsers(await listUserIdsWithPermission(team, "requests.approve"), {
        title: "החלפת משמרת ממתינה לאישורך",
        body: `${swap.requesterName} ו${swap.targetUserName} · ${swap.shiftLabel}`,
        link: REQUESTS_LINK
      });
      return;
    case "DECLINED_BY_EMPLOYEE":
      await notifyUsers([swap.requesterId], {
        title: "בקשת ההחלפה נדחתה",
        body: `${swap.targetUserName} לא הסכים/ה להחליף (${swap.shiftLabel}).`,
        link: REQUESTS_LINK
      });
      return;
    case "APPROVED":
      await notifyUsers([swap.requesterId, swap.targetUserId], {
        title: "ההחלפה אושרה",
        body: swap.targetShiftLabel
          ? `${swap.shiftLabel} עברה ל${swap.targetUserName}, ו${swap.targetShiftLabel} עברה ל${swap.requesterName}.`
          : `${swap.shiftLabel} עברה ל${swap.targetUserName}.`,
        link: REQUESTS_LINK
      });
      return;
    case "DECLINED_BY_MANAGER":
      await notifyUsers([swap.requesterId, swap.targetUserId], {
        title: "ההחלפה לא אושרה",
        body: `ההחלפה בין ${swap.requesterName} ל${swap.targetUserName} (${swap.shiftLabel}) לא אושרה.`,
        link: REQUESTS_LINK
      });
      return;
    case "CANCELLED":
      await notifyUsers([swap.targetUserId], {
        title: "בקשת ההחלפה בוטלה",
        body: `${swap.requesterName} ביטל/ה את הבקשה (${swap.shiftLabel}).`,
        link: REQUESTS_LINK
      });
  }
}

export async function notifyGiveawayOffered(giveaway: Giveaway, teamMemberIds: string[]) {
  await notifyUsers(
    teamMemberIds.filter((id) => id !== giveaway.offeredBy),
    {
      title: "משמרת זמינה למסירה",
      body: `${giveaway.offeredByName} מוסר/ת: ${giveawayShift(giveaway)}. רוצה לקחת?`,
      link: REQUESTS_LINK
    }
  );
}

export async function notifyGiveawayUpdated(giveaway: Giveaway, team: Team) {
  const shift = giveawayShift(giveaway);
  switch (giveaway.status) {
    case "PENDING_MANAGER":
      await notifyUsers([giveaway.offeredBy], {
        title: "מישהו רוצה לקחת את המשמרת שלך",
        body: `${giveaway.takenByName} ביקש/ה לקחת: ${shift}. ממתין לאישור.`,
        link: REQUESTS_LINK
      });
      await notifyUsers(await listUserIdsWithPermission(team, "requests.approve"), {
        title: "מסירת משמרת ממתינה לאישורך",
        body: `${giveaway.offeredByName} → ${giveaway.takenByName} · ${shift}`,
        link: REQUESTS_LINK
      });
      return;
    case "APPROVED":
      await notifyUsers([giveaway.offeredBy], {
        title: "מסירת המשמרת אושרה",
        body: `${shift} עברה ל${giveaway.takenByName}.`,
        link: REQUESTS_LINK
      });
      await notifyUsers([giveaway.takenBy], {
        title: "קיבלת משמרת",
        body: `${shift} (מ${giveaway.offeredByName}) עכשיו שלך.`,
        link: REQUESTS_LINK
      });
      return;
    case "DECLINED_BY_MANAGER":
      await notifyUsers([giveaway.offeredBy, giveaway.takenBy], {
        title: "מסירת המשמרת לא אושרה",
        body: `המסירה של ${shift} לא אושרה.`,
        link: REQUESTS_LINK
      });
      return;
    case "CANCELLED":
      await notifyUsers([giveaway.takenBy], {
        title: "מסירת המשמרת בוטלה",
        body: `${giveaway.offeredByName} ביטל/ה את המסירה של ${shift}.`,
        link: REQUESTS_LINK
      });
  }
}

export async function notifyVacationRequested(vacation: VacationRequest, team: Team | null) {
  if (!team) {
    return;
  }
  await notifyUsers(await listUserIdsWithPermission(team, "requests.approve"), {
    title: "בקשת חופשה חדשה",
    body: `${vacation.userName} · ${dateRangeLabel(vacation.startDate, vacation.endDate)}`,
    link: REQUESTS_LINK
  });
}

export async function notifyVacationDecided(vacation: VacationRequest) {
  const dates = dateRangeLabel(vacation.startDate, vacation.endDate);
  if (vacation.status === "APPROVED") {
    const removed = vacation.removedShiftCount > 0 ? ` ${vacation.removedShiftCount} משמרות בימים אלה הוסרו מהסידור.` : "";
    await notifyUsers([vacation.userId], { title: "החופשה אושרה", body: `החופשה ${dates} אושרה.${removed}`, link: REQUESTS_LINK });
  } else if (vacation.status === "DECLINED") {
    await notifyUsers([vacation.userId], { title: "החופשה לא אושרה", body: `בקשת החופשה ${dates} לא אושרה.`, link: REQUESTS_LINK });
  }
}
