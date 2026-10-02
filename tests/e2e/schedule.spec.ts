import { expect, test } from "@playwright/test";
import { addDays, call, signIn, teamByName, weekStart } from "./helpers";

test("a team lead auto-fills, edits and publishes a week; the team is notified", async ({ browser }) => {
  const week = weekStart(4);
  const lead = await signIn(browser, "lead1");
  const noa = await signIn(browser, "noa");
  try {
    await lead.goto(`/schedule?week=${week}`);
    await expect(lead.locator(".planner-grid")).toBeVisible();

    await lead.getByRole("button", { name: "מילוי אוטומטי" }).click();
    await expect(lead.locator(".toast")).toContainText(/נוספו \d+ שיבוצים|לא נמצאו מקומות/);
    await expect(lead.locator(".badge", { hasText: "איוש" })).toBeVisible();

    // Open a shift, remove someone, and put them back.
    await lead.locator("button.planner-cell").first().click();
    const panel = lead.getByRole("dialog");
    await expect(panel).toBeVisible();
    const firstChip = panel.locator(".side-panel-tools .chip").first();
    const name = (await firstChip.textContent())!.trim();
    await firstChip.getByRole("button", { name: "הסרה מהמשמרת" }).click();
    await expect(lead.locator(".toast")).toContainText("הוסר/ה");
    await panel.getByPlaceholder("חיפוש עובד/ת").fill(name);
    await panel.locator(".picker-row", { hasText: name }).first().click();
    await expect(lead.locator(".toast")).toContainText("שובץ/ה");
    await lead.keyboard.press("Escape");

    // Publish: Noa (a שירות לקוחות member) gets a notification about this week.
    await lead.getByRole("button", { name: /פרסום השבוע|שליחת עדכון/ }).click();
    await lead.getByRole("dialog").getByRole("button", { name: /פרסום ושליחה|שליחת עדכון/ }).click();
    await expect(lead.locator(".toast")).toContainText("אנשי צוות");
    await expect(lead.locator(".badge", { hasText: "פורסם" })).toBeVisible();

    const { body } = await call<{ notifications: { title: string; link: string }[] }>(noa, "/api/notifications");
    expect(body.notifications.some((item) => item.title.includes("שירות לקוחות") && item.link.includes(`week=${week}`))).toBe(true);
  } finally {
    await lead.context().close();
    await noa.context().close();
  }
});

test("scheduling someone on their day off needs confirmation", async ({ browser }) => {
  const week = weekStart(5);
  const lead = await signIn(browser, "lead1");
  const noa = await signIn(browser, "noa");
  try {
    const { shifts } = await teamByName(lead, "שירות לקוחות");
    const morning = shifts.find((shift) => shift.name === "בוקר")!;
    const date = addDays(week, 1);
    expect((await call(noa, "/api/availability", "PUT", { workDate: date, shiftTemplateId: null, status: "TIME_OFF" })).status).toBe(200);
    const me = await call<{ user: { id: string } }>(noa, "/api/me");
    // Start clean if an earlier run left Noa on that day.
    const before = await call<{ assignments: { id: string; userId: string; workDate: string }[] }>(lead, `/api/schedule?week=${week}&team=${morning.teamId}`);
    for (const assignment of before.body.assignments.filter((item) => item.userId === me.body.user.id && item.workDate === date)) {
      await call(lead, `/api/assignments/${assignment.id}`, "DELETE");
    }

    const first = await call<{ details: { warnings: { code: string }[] } }>(lead, "/api/assignments", "POST", {
      userId: me.body.user.id,
      shiftTemplateId: morning.id,
      workDate: date
    });
    expect(first.status).toBe(409);
    expect(first.body.details.warnings.map((warning) => warning.code)).toContain("TIME_OFF");

    const confirmed = await call(lead, "/api/assignments", "POST", {
      userId: me.body.user.id,
      shiftTemplateId: morning.id,
      workDate: date,
      acknowledgeWarnings: true
    });
    expect(confirmed.status).toBe(201);

    // The same person can't work an overlapping shift.
    const evening = shifts.find((shift) => shift.name === "ערב")!;
    const overlap = await call(lead, "/api/assignments", "POST", { userId: me.body.user.id, shiftTemplateId: evening.id, workDate: date, acknowledgeWarnings: true });
    expect(overlap.status).toBe(422);
  } finally {
    await lead.context().close();
    await noa.context().close();
  }
});
