import { expect, test } from "@playwright/test";
import { call, signIn, teamByName } from "./helpers";

test("an admin adds a person with an extra permission, and it takes effect", async ({ browser }) => {
  const email = `e2e.${Date.now()}@wecomconnect.local`;
  const admin = await signIn(browser, "admin");
  try {
    await admin.goto("/people");
    await admin.getByRole("button", { name: "הוספת עובד/ת" }).click();
    const dialog = admin.getByRole("dialog");
    await dialog.getByLabel("שם מלא").fill("בודק אוטומטי");
    await dialog.getByLabel("אימייל (לכניסה)").fill(email);
    await dialog.getByRole("combobox", { name: /^צוות/ }).selectOption({ label: "תמיכה Tier 2" });
    await dialog.getByLabel("סיסמה ראשונית").fill("LocalOnly123!");
    await dialog.locator(".permission-item", { hasText: "צפייה בנתונים" }).locator("input").check();
    await dialog.getByRole("button", { name: "הוספה" }).click();
    await expect(admin.locator(".toast")).toContainText("נוסף/ה");
  } finally {
    await admin.context().close();
  }

  const person = await signIn(browser, email);
  try {
    await expect(person.getByRole("navigation", { name: "ניווט ראשי" }).getByRole("link", { name: "תובנות" })).toBeVisible();
    const { body } = await call<{ reportTeams: { name: string }[] }>(person, "/api/insights");
    expect(body.reportTeams.map((team) => team.name)).toEqual(["תמיכה Tier 2"]);
  } finally {
    await person.context().close();
  }
});

test("a team lead can't manage people; a department manager can't reach another department", async ({ browser }) => {
  const lead = await signIn(browser, "lead1");
  const manager = await signIn(browser, "support");
  try {
    await lead.goto("/people");
    await expect(lead.locator(".person-row").first()).toBeVisible();
    await expect(lead.getByRole("button", { name: "הוספת עובד/ת" })).toHaveCount(0);
    const { body } = await call<{ people: { id: string }[] }>(lead, "/api/people");
    expect((await call(lead, `/api/people/${body.people[0].id}`, "PATCH", { title: "x" })).status).toBe(403);

    const created = await call(manager, "/api/people", "POST", {
      name: "לא אמור להיווצר",
      email: `blocked.${Date.now()}@wecomconnect.local`,
      role: "DEPARTMENT_MANAGER",
      departmentId: null,
      password: "LocalOnly123!"
    });
    expect([400, 403]).toContain(created.status);
  } finally {
    await lead.context().close();
    await manager.context().close();
  }
});

test("a department manager adds and archives a shift for one of their teams", async ({ browser }) => {
  const manager = await signIn(browser, "support");
  const name = `בדיקה ${Date.now() % 10000}`;
  try {
    await manager.goto("/settings");
    await manager.getByRole("combobox", { name: "צוות" }).selectOption({ label: "תמיכה Tier 2" });
    await manager.getByRole("button", { name: "משמרת חדשה" }).click();
    const dialog = manager.getByRole("dialog");
    await dialog.getByLabel("שם המשמרת").fill(name);
    await dialog.getByLabel("התחלה").fill("10:00");
    await dialog.getByLabel("סיום").fill("14:00");
    await dialog.getByLabel("כמה אנשים צריך").fill("1");
    await dialog.getByRole("button", { name: "שמירה" }).click();
    await expect(manager.locator(".toast")).toContainText("נוספה");

    const row = manager.locator(".shift-row", { hasText: name });
    await expect(row).toContainText("10:00-14:00");
    await row.getByRole("button", { name: `העברת ${name} לארכיון` }).click();
    await expect(row).toContainText("בארכיון");
    const { shifts } = await teamByName(manager, "תמיכה Tier 2");
    expect(shifts.some((shift) => shift.name === name)).toBe(false);
  } finally {
    await manager.context().close();
  }
});
