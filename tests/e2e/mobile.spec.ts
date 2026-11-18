import { devices, expect, test, type Browser, type Page } from "@playwright/test";

const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "LocalOnly123!";
const phone = { ...devices["iPhone 13"], defaultBrowserType: undefined };

function currentWeekStart() {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - date.getUTCDay());
  return date.toISOString().slice(0, 10);
}

async function phonePage(browser: Browser, email: string) {
  const context = await browser.newContext({ ...phone, locale: "he-IL" });
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("אימייל או שם משתמש").fill(email);
  await page.getByLabel("סיסמה").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "כניסה" }).click();
  await page.waitForURL("/");
  return page;
}

async function visibleDays(page: Page) {
  return page.locator(".schedule-day-strip button.visible strong").allTextContents();
}

test("phone schedule: day strip jumps to a day and swipes stop exactly on a day", async ({ browser }) => {
  const page = await phonePage(browser, "admin");
  try {
    await page.goto("/schedule");
    const strip = page.locator(".schedule-day-strip");
    await expect(strip).toBeVisible();
    await expect(strip.locator("button.visible")).toHaveCount(2);

    await strip.getByRole("button", { name: /^ראשון/ }).tap();
    await expect.poll(() => visibleDays(page)).toEqual(["א׳", "ב׳"]);
    await strip.getByRole("button", { name: /^שבת/ }).tap();
    await expect.poll(() => visibleDays(page)).toEqual(["ו׳", "ש׳"]);

    // A partial scroll settles on a whole day, never half a column.
    const panel = page.locator(".schedule-panel");
    await panel.evaluate((el) => el.scrollBy({ left: 90 }));
    await expect
      .poll(() =>
        panel.evaluate((el) => {
          const start = el.querySelector(".grid-header .shift-label-column")!.getBoundingClientRect().left;
          const offsets = [...el.querySelectorAll(".grid-header .day-header")].map((header) =>
            Math.abs(header.getBoundingClientRect().right - start)
          );
          return Math.min(...offsets) <= 3;
        })
      )
      .toBe(true);

    // The shift names stay pinned while the days move, and the top bar no longer covers them.
    await expect(page.locator(".shift-name").first()).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  } finally {
    await page.context().close();
  }
});

test("phone swap: the warning window closes after sending, and after a server error", async ({ browser }) => {
  const weekStart = currentWeekStart();
  const manager = await phonePage(browser, "admin");
  const noa = await phonePage(browser, "noa");
  const created: string[] = [];
  try {
    const schedule = await (await manager.request.get(`/api/schedule?weekStart=${weekStart}`)).json();
    const idOf = (name: string) => schedule.employees.find((employee: { name: string }) => employee.name === name).id;
    // Clear the two cells this test uses, then give Noa Friday morning and the other
    // employee Thursday evening: taking Noa's shift leaves them exactly 8 hours of rest.
    for (const assignment of schedule.assignments) {
      if ((assignment.dayIndex === 5 && assignment.shiftType === "MORNING") ||
          (assignment.dayIndex === 4 && assignment.shiftType === "EVENING")) {
        await manager.request.delete(`/api/assignments/${assignment.id}`);
      }
    }
    for (const [employee, dayIndex, shiftType] of [
      ["נועה כהן", 5, "MORNING"],
      ["עובד בדיקה", 4, "EVENING"]
    ] as const) {
      const response = await manager.request.post("/api/assignments", {
        data: { employeeId: idOf(employee), weekStart, dayIndex, shiftType, acknowledgeWarnings: true }
      });
      expect(response.status(), await response.text()).toBe(201);
      created.push((await response.json()).assignment.id);
    }

    await noa.goto("/schedule");
    const form = noa.locator("form.compact-form");
    await form.locator('select[name="requesterAssignmentId"]').selectOption(created[0]);
    await form.locator('select[name="targetEmployeeId"]').selectOption(idOf("עובד בדיקה"));

    // 1. A server error while the warning window is open: the window closes with a message.
    await form.getByRole("button", { name: "שלח החלפה" }).tap();
    const dialog = noa.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await noa.route("**/api/swaps", (route) => route.fulfill({ status: 500, body: "" }), { times: 1 });
    await dialog.getByRole("button", { name: "שלח בכל זאת" }).tap();
    await expect(dialog).toBeHidden();
    await expect(noa.locator(".toast")).toContainText("נכשלה");

    // 2. The normal path: confirm the warning, the request is sent and the window closes.
    await form.locator('select[name="requesterAssignmentId"]').selectOption(created[0]);
    await form.locator('select[name="targetEmployeeId"]').selectOption(idOf("עובד בדיקה"));
    await form.getByRole("button", { name: "שלח החלפה" }).tap();
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "שלח בכל זאת" }).tap();
    await expect(dialog).toBeHidden();
    await expect(noa.locator(".toast")).toContainText("בקשת ההחלפה נשלחה");
  } finally {
    for (const id of created) {
      await manager.request.delete(`/api/assignments/${id}`);
    }
    await Promise.all([manager, noa].map((page) => page.context().close()));
  }
});
