import { expect, test, type Page } from "@playwright/test";
import { addDays, call, peopleByName, signIn, teamByName, weekStart } from "./helpers";

async function clearDay(lead: Page, teamId: string, week: string, userIds: string[], dates: string[]) {
  const { body } = await call<{ assignments: { id: string; userId: string; workDate: string }[] }>(lead, `/api/schedule?week=${week}&team=${teamId}`);
  for (const assignment of body.assignments.filter((item) => userIds.includes(item.userId) && dates.includes(item.workDate))) {
    await call(lead, `/api/assignments/${assignment.id}`, "DELETE");
  }
}

test("swap: colleague accepts, the team lead approves, the shift moves", async ({ browser }) => {
  const week = weekStart(6);
  const date = addDays(week, 2);
  const admin = await signIn(browser, "admin");
  const people = await peopleByName(admin);
  await admin.context().close();

  const noaId = people.get("נועה כהן")!.id;
  const colleague = [...people.values()].find((person) => person.teamId === people.get("נועה כהן")!.teamId && person.email.startsWith("t1.0"))!;

  const lead = await signIn(browser, "lead1");
  const noa = await signIn(browser, "noa");
  const other = await signIn(browser, colleague.email);
  try {
    const { team, shifts } = await teamByName(lead, "תמיכה Tier 1");
    const evening = shifts.find((shift) => shift.name === "ערב")!;
    await clearDay(lead, team.id, week, [noaId, colleague.id], [addDays(date, -1), date, addDays(date, 1)]);
    const created = await call<{ assignment: { id: string } }>(lead, "/api/assignments", "POST", { userId: noaId, shiftTemplateId: evening.id, workDate: date, acknowledgeWarnings: true });
    expect(created.status).toBe(201);

    // Noa asks the colleague from the Requests page.
    await noa.goto("/requests");
    await noa.getByRole("button", { name: "החלפה", exact: true }).click();
    const dialog = noa.getByRole("dialog");
    await dialog.getByRole("combobox", { name: /^המשמרת שלי/ }).selectOption(created.body.assignment.id);
    await dialog.getByRole("combobox", { name: /^עם מי/ }).selectOption(colleague.id);
    await dialog.getByRole("button", { name: "שליחת בקשה" }).click();
    await expect(noa.locator(".toast")).toContainText("נשלחה");

    await other.goto("/requests");
    const incoming = other.locator(".request-item", { hasText: "נועה כהן מבקש/ת להחליף איתך" }).first();
    await incoming.getByRole("button", { name: "מסכים/ה" }).click();
    await expect(other.locator(".toast")).toContainText("ממתינה לאישור");

    await lead.goto("/requests?tab=approvals");
    await lead.locator(".request-item", { hasText: "נועה כהן" }).first().getByRole("button", { name: "אישור" }).click();
    await expect(lead.locator(".toast")).toContainText("אושרה");

    const after = await call<{ assignments: { id: string; userId: string }[] }>(lead, `/api/schedule?week=${week}&team=${team.id}`);
    expect(after.body.assignments.find((item) => item.id === created.body.assignment.id)?.userId).toBe(colleague.id);
  } finally {
    await lead.context().close();
    await noa.context().close();
    await other.context().close();
  }
});

test("vacation: approval marks the days off and removes the shifts", async ({ browser }) => {
  const week = weekStart(7);
  const start = addDays(week, 1);
  const end = addDays(week, 2);
  const lead = await signIn(browser, "lead1");
  const noa = await signIn(browser, "noa");
  try {
    const { team, shifts } = await teamByName(lead, "תמיכה Tier 1");
    const me = await call<{ user: { id: string } }>(noa, "/api/me");
    await clearDay(lead, team.id, week, [me.body.user.id], [start, end]);
    const morning = shifts.find((shift) => shift.name === "בוקר")!;
    expect((await call(lead, "/api/assignments", "POST", { userId: me.body.user.id, shiftTemplateId: morning.id, workDate: start, acknowledgeWarnings: true })).status).toBe(201);

    await noa.goto("/requests");
    await noa.getByRole("button", { name: "חופשה", exact: true }).click();
    const dialog = noa.getByRole("dialog");
    await dialog.getByLabel("מתאריך").fill(start);
    await dialog.getByLabel("עד תאריך").fill(end);
    await dialog.getByRole("button", { name: "שליחת בקשה" }).click();
    await expect(noa.locator(".toast")).toContainText("נשלחה");

    await lead.goto("/requests?tab=approvals");
    await lead.locator(".request-item", { hasText: "חופשה: נועה כהן" }).first().getByRole("button", { name: "אישור" }).click();
    await expect(lead.locator(".toast")).toContainText("אושרה");

    const schedule = await call<{ assignments: { userId: string; workDate: string }[] }>(lead, `/api/schedule?week=${week}&team=${team.id}`);
    expect(schedule.body.assignments.some((item) => item.userId === me.body.user.id && item.workDate >= start && item.workDate <= end)).toBe(false);
    const availability = await call<{ entries: { workDate: string; status: string }[] }>(noa, `/api/availability?week=${week}`);
    expect(availability.body.entries.filter((entry) => entry.status === "TIME_OFF").map((entry) => entry.workDate)).toEqual(expect.arrayContaining([start, end]));
  } finally {
    await lead.context().close();
    await noa.context().close();
  }
});

test("giveaway: offered to the team, taken by a colleague, approved", async ({ browser }) => {
  // Within the 6 weeks the Requests page lists as offerable shifts.
  const week = weekStart(3);
  const date = addDays(week, 3);
  const admin = await signIn(browser, "admin");
  const people = await peopleByName(admin);
  await admin.context().close();
  const noaId = people.get("נועה כהן")!.id;
  const colleague = [...people.values()].filter((person) => person.teamId === people.get("נועה כהן")!.teamId && person.email.startsWith("t1.1"))[0];

  const lead = await signIn(browser, "lead1");
  const noa = await signIn(browser, "noa");
  const other = await signIn(browser, colleague.email);
  try {
    const { team, shifts } = await teamByName(lead, "תמיכה Tier 1");
    await clearDay(lead, team.id, week, [noaId, colleague.id], [addDays(date, -1), date, addDays(date, 1)]);
    const night = shifts.find((shift) => shift.name === "לילה")!;
    const created = await call<{ assignment: { id: string } }>(lead, "/api/assignments", "POST", { userId: noaId, shiftTemplateId: night.id, workDate: date, acknowledgeWarnings: true });
    expect(created.status).toBe(201);

    await noa.goto("/requests");
    await noa.getByRole("button", { name: "מסירה", exact: true }).click();
    await noa.getByRole("dialog").getByRole("combobox", { name: /^איזו משמרת/ }).selectOption(created.body.assignment.id);
    await noa.getByRole("dialog").getByRole("button", { name: "פרסום למסירה" }).click();
    await expect(noa.locator(".toast")).toContainText("פורסמה");

    await other.goto("/requests?tab=board");
    await other.locator(".request-item", { hasText: "נועה כהן" }).first().getByRole("button", { name: "אני לוקח/ת" }).click();
    await expect(other.locator(".toast")).toContainText("ממתין לאישור");

    await lead.goto("/requests?tab=approvals");
    await lead.locator(".request-item", { hasText: "מסירה: נועה כהן" }).first().getByRole("button", { name: "אישור" }).click();
    await expect(lead.locator(".toast")).toContainText("אושרה");

    const after = await call<{ assignments: { id: string; userId: string }[] }>(lead, `/api/schedule?week=${week}&team=${team.id}`);
    expect(after.body.assignments.find((item) => item.id === created.body.assignment.id)?.userId).toBe(colleague.id);
  } finally {
    await lead.context().close();
    await noa.context().close();
    await other.context().close();
  }
});
