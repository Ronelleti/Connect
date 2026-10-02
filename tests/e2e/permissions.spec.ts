import { expect, test } from "@playwright/test";
import { call, peopleByName, signIn, teamByName, weekStart } from "./helpers";

test("an employee sees only their own team and no management screens", async ({ browser }) => {
  const noa = await signIn(browser, "noa");
  try {
    const nav = noa.getByRole("navigation", { name: "ניווט ראשי" });
    await expect(nav.getByRole("link", { name: "סידור" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "תובנות" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "צוותים ומשמרות" })).toHaveCount(0);

    expect((await call(noa, "/api/insights")).status).toBe(403);
    await noa.goto("/insights");
    await expect(noa).toHaveURL(/\/$/);

    await noa.goto("/schedule");
    await expect(noa.locator(".planner-grid")).toBeVisible();
    await expect(noa.getByRole("combobox", { name: "צוות" })).toHaveCount(0);
    await expect(noa.getByRole("button", { name: "מילוי אוטומטי" })).toHaveCount(0);

    const { body } = await call<{ people: { teamId: string; email: string; name: string }[] }>(noa, "/api/people");
    const teams = new Set(body.people.map((person) => person.teamId));
    expect(teams.size).toBe(1);
    // Colleagues' contact details are hidden from employees.
    expect(body.people.filter((person) => person.name !== "נועה כהן").every((person) => person.email === "")).toBe(true);
  } finally {
    await noa.context().close();
  }
});

test("a team lead schedules only their own team", async ({ browser }) => {
  const lead = await signIn(browser, "lead1");
  try {
    await lead.goto("/schedule");
    await expect(lead.getByRole("button", { name: "מילוי אוטומטי" })).toBeVisible();
    await expect(lead.getByRole("combobox", { name: "צוות" })).toHaveCount(0);

    // Another team's shifts aren't even visible to this lead.
    const sales = await teamByName(lead, "מכירות").catch(() => null);
    expect(sales).toBeNull();

    await lead.goto("/insights");
    await expect(lead.getByRole("combobox", { name: "צוות" }).locator("option")).toHaveText(["שירות לקוחות"]);
  } finally {
    await lead.context().close();
  }
});

test("per-person extras add abilities on top of the role", async ({ browser }) => {
  // יוסי is an employee with the extra permissions "requests.approve" and "reports.view".
  const yossi = await signIn(browser, "yossi");
  try {
    await expect(yossi.getByRole("navigation", { name: "ניווט ראשי" }).getByRole("link", { name: "תובנות" })).toBeVisible();
    expect((await call(yossi, "/api/insights")).status).toBe(200);
    await yossi.goto("/schedule");
    await expect(yossi.locator(".planner-grid")).toBeVisible();
    await expect(yossi.getByRole("button", { name: "מילוי אוטומטי" })).toHaveCount(0);
    await yossi.goto("/requests");
    await expect(yossi.getByRole("tab", { name: /ממתין לאישורי/ })).toBeVisible();
  } finally {
    await yossi.context().close();
  }
});

test("a senior manager sees and approves across every team", async ({ browser }) => {
  const manager = await signIn(browser, "manager1");
  try {
    await manager.goto("/schedule");
    await expect(manager.getByRole("combobox", { name: "צוות" }).locator("option")).toHaveText(["מכירות", "שירות לקוחות", "תמיכה טכנית"]);
    await expect(manager.getByRole("button", { name: "מילוי אוטומטי" })).toBeVisible();
    const { body } = await call<{ reportTeams: { name: string }[] }>(manager, "/api/insights");
    expect(body.reportTeams).toHaveLength(3);
    await manager.goto("/requests");
    await expect(manager.getByRole("tab", { name: /ממתין לאישורי/ })).toBeVisible();
    // Organization structure and per-person permissions stay with admins.
    expect((await call(manager, "/api/departments", "POST", { name: "בדיקה" })).status).toBe(403);
  } finally {
    await manager.context().close();
  }
});

test("a support expert can be scheduled in another team and sees every team", async ({ browser }) => {
  const admin = await signIn(browser, "admin");
  const people = await peopleByName(admin);
  await admin.context().close();
  const expert = [...people.values()].find((person) => person.email.startsWith("expert1@"))!;

  const lead = await signIn(browser, "lead1");
  const expertPage = await signIn(browser, "expert1");
  try {
    // Lead of שירות לקוחות finds the expert (home team: תמיכה טכנית) in the picker and schedules them.
    const week = weekStart(9);
    const { team, shifts } = await teamByName(lead, "שירות לקוחות");
    const before = await call<{ assignments: { id: string; userId: string; workDate: string }[] }>(lead, `/api/schedule?week=${week}&team=${team.id}`);
    for (const assignment of before.body.assignments.filter((item) => item.userId === expert.id)) {
      await call(lead, `/api/assignments/${assignment.id}`, "DELETE");
    }
    await lead.goto(`/schedule?week=${week}`);
    const morning = shifts.find((shift) => shift.name === "בוקר")!;
    // The third cell of the first row: the morning shift on Tuesday.
    await lead.locator("button.planner-cell").nth(2).click();
    const panel = lead.getByRole("dialog");
    await expect(panel.getByText("מומחים מצוותים אחרים")).toBeVisible();
    await panel.locator(".picker-row", { hasText: expert.name }).first().click();
    await expect(lead.locator(".toast")).toContainText("שובץ/ה");
    const after = await call<{ assignments: { userId: string; shiftTemplateId: string }[] }>(lead, `/api/schedule?week=${week}&team=${team.id}`);
    expect(after.body.assignments.some((item) => item.userId === expert.id && item.shiftTemplateId === morning.id)).toBe(true);

    // The expert sees all three teams' schedules but can't edit them.
    await expertPage.goto("/schedule");
    await expect(expertPage.getByRole("combobox", { name: "צוות" }).locator("option")).toHaveCount(3);
    await expect(expertPage.getByRole("button", { name: "מילוי אוטומטי" })).toHaveCount(0);
  } finally {
    await lead.context().close();
    await expertPage.context().close();
  }
});
