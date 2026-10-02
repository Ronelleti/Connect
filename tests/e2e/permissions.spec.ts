import { expect, test } from "@playwright/test";
import { call, signIn, teamByName } from "./helpers";

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

    const tier2 = await teamByName(lead, "תמיכה Tier 2").catch(() => null);
    expect(tier2).toBeNull();

    await lead.goto("/insights");
    await expect(lead.getByRole("combobox", { name: "צוות" }).locator("option")).toHaveText(["תמיכה Tier 1"]);
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

test("a department manager sees their department's teams only", async ({ browser }) => {
  const manager = await signIn(browser, "support");
  try {
    await manager.goto("/schedule");
    await expect(manager.getByRole("combobox", { name: "צוות" }).locator("option")).toHaveText(["תמיכה Tier 1", "תמיכה Tier 2"]);
    const { body } = await call<{ reportTeams: { name: string }[] }>(manager, "/api/insights");
    expect(body.reportTeams.map((team) => team.name).sort()).toEqual(["תמיכה Tier 1", "תמיכה Tier 2"]);
  } finally {
    await manager.context().close();
  }
});
