import { NextResponse } from "next/server";
import { decideSwapRequest } from "@/server/repositories";
import { readSwapApprovalToken } from "@/server/swapApprovalToken";
import { notifySwapDecision } from "@/server/swapNotifications";

// GET only renders a confirmation page and never mutates state, since some email
// clients and corporate security gateways prefetch links to scan them; the actual
// decision is only applied when the manager submits the confirmation form (POST).
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const token = new URL(request.url).searchParams.get("token");
  const payload = readSwapApprovalToken(token);

  if (!payload || payload.swapId !== id) {
    return htmlPage("קישור לא תקין", "הקישור אינו תקין או שפג תוקפו.", "warning");
  }

  const isApproval = payload.action === "approve_manager";
  const question = isApproval ? "לאשר את בקשת ההחלפה?" : "לדחות את בקשת ההחלפה?";
  const buttonLabel = isApproval ? "כן, לאשר את ההחלפה" : "כן, לדחות את ההחלפה";
  const buttonColor = isApproval ? "#2d8f68" : "#d94848";

  return htmlPage(
    "אישור בקשת החלפה",
    `
      <p>${escapeHtml(payload.summary)}</p>
      <p>${question}</p>
      <form method="post" action="?token=${encodeURIComponent(token ?? "")}">
        <button type="submit" style="background:${buttonColor};color:#fff;border:0;
          padding:12px 24px;border-radius:6px;font-size:15px;font-weight:bold;cursor:pointer;">
          ${buttonLabel}
        </button>
      </form>
    `,
    "info"
  );
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const token = new URL(request.url).searchParams.get("token");
  const payload = readSwapApprovalToken(token);

  if (!payload || payload.swapId !== id) {
    return htmlPage("קישור לא תקין", "הקישור אינו תקין או שפג תוקפו.", "warning");
  }

  const swap = await decideSwapRequest(id, payload.action);
  if (!swap) {
    return htmlPage(
      "לא ניתן לבצע",
      "בקשת ההחלפה כבר טופלה או שהשיבוץ השתנה בינתיים.",
      "warning"
    );
  }
  await notifySwapDecision(swap, payload.action);

  if (payload.action === "decline_manager") {
    return htmlPage("ההחלפה נדחתה", "בקשת ההחלפה נדחתה בהצלחה.", "success");
  }

  return htmlPage(
    "האישור נקלט",
    swap.status === "APPROVED"
      ? "ההחלפה אושרה בהצלחה והשיבוץ עודכן."
      : "האישור שלך נקלט. ההחלפה תבוצע לאחר אישור העובד.",
    "success"
  );
}

function htmlPage(title: string, bodyHtml: string, tone: "success" | "warning" | "info") {
  const accent = { success: "#2d8f68", warning: "#d94848", info: "#1677e8" }[tone];
  const html = `<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} · Wecomconnect</title>
</head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
  background:#0f1420;font-family:Arial, sans-serif;">
  <div style="background:#171e2b;border:1px solid #2a3444;border-right:4px solid ${accent};
    border-radius:10px;padding:32px 36px;max-width:420px;color:#f2f4f8;text-align:center;">
    <h1 style="font-size:19px;margin:0 0 14px;">${escapeHtml(title)}</h1>
    <div style="font-size:15px;line-height:1.7;">${bodyHtml}</div>
  </div>
</body>
</html>`;
  return new NextResponse(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
