import { addDays, formatHebrewDate } from "@/lib/dates";
import { SHIFT_DEFINITIONS } from "@/lib/shifts";
import type { ShiftSwapRequest } from "@/lib/types";
import { sendMail } from "./mailer";
import { signSwapApprovalToken, type SwapEmailAction } from "./swapApprovalToken";

export async function notifyManagerOfSwapRequest(swap: ShiftSwapRequest, origin: string) {
  const managerEmail = process.env.MANAGER_APPROVAL_EMAIL?.trim();
  if (!managerEmail) {
    return;
  }

  const summary = buildSwapSummary(swap);
  const approveUrl = buildDecisionUrl(origin, swap.id, "approve_manager", summary);
  const declineUrl = buildDecisionUrl(origin, swap.id, "decline_manager", summary);

  await sendMail({
    to: managerEmail,
    subject: "בקשת החלפת משמרת ממתינה לאישורך",
    text: `${summary}\n\nלאישור: ${approveUrl}\nלדחייה: ${declineUrl}`,
    html: `
      <div dir="rtl" style="font-family: Arial, sans-serif; font-size: 15px; color: #182237;">
        <p>${summary}</p>
        <p style="margin-top: 20px;">
          <a href="${approveUrl}"
             style="background:#2d8f68;color:#fff;padding:10px 20px;border-radius:6px;
                    text-decoration:none;display:inline-block;margin-inline-start:10px;font-weight:bold;">
            אישור ההחלפה
          </a>
          <a href="${declineUrl}"
             style="background:#d94848;color:#fff;padding:10px 20px;border-radius:6px;
                    text-decoration:none;display:inline-block;font-weight:bold;">
            דחיית ההחלפה
          </a>
        </p>
      </div>
    `
  });
}

function buildSwapSummary(swap: ShiftSwapRequest): string {
  const shiftLabel =
    swap.weekStart && swap.dayIndex !== undefined && swap.shiftType
      ? `${formatHebrewDate(addDays(swap.weekStart, swap.dayIndex))} · ${SHIFT_DEFINITIONS[swap.shiftType].label}`
      : "משמרת";
  return `${swap.requesterEmployeeName ?? "עובד"} מבקש/ת להחליף עם ${
    swap.targetEmployeeName ?? "עובד/ת יעד"
  } (${shiftLabel})`;
}

function buildDecisionUrl(
  origin: string,
  swapId: string,
  action: SwapEmailAction,
  summary: string
): string {
  const token = signSwapApprovalToken(swapId, action, summary);
  return `${origin}/api/swaps/${swapId}/email-decision?token=${encodeURIComponent(token)}`;
}
