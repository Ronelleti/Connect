import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";

const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "LocalOnly123!";

// A week far enough ahead that none of its shifts have started, and that doesn't
// collide with the current or availability weeks used by the schedule tests.
function futureWeekStart(weeksAhead: number) {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - date.getUTCDay() + weeksAhead * 7);
  return date.toISOString().slice(0, 10);
}

function addDays(dateOnly: string, days: number) {
  const date = new Date(`${dateOnly}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function hebrewDate(dateOnly: string) {
  const [, month, day] = dateOnly.split("-");
  return `${day}.${month}`;
}

async function signedInPage(browser: Browser, email: string, viewport = { width: 1280, height: 900 }) {
  const context = await browser.newContext({ viewport, locale: "he-IL" });
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("אימייל או שם משתמש").fill(email);
  await page.getByLabel("סיסמה").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "כניסה" }).click();
  await page.waitForURL("/");
  return page;
}

async function employeeIdByName(request: APIRequestContext, weekStart: string, name: string) {
  const response = await request.get(`/api/schedule?weekStart=${weekStart}`);
  const body = await response.json();
  return body.employees.find((employee: { name: string }) => employee.name === name).id as string;
}

async function assignShift(manager: Page, employeeId: string, weekStart: string, dayIndex: number, shiftType: string) {
  const response = await manager.request.post("/api/assignments", {
    data: { employeeId, weekStart, dayIndex, shiftType, acknowledgeWarnings: true }
  });
  expect(response.status(), await response.text()).toBe(201);
  return (await response.json()).assignment.id as string;
}

async function openBell(page: Page) {
  await page.locator(".notification-bell > button").click();
  return page.locator(".notification-panel");
}

test("shift giveaway: offer, take, manager approval and notifications", async ({ browser }) => {
  const weekStart = futureWeekStart(5);
  const manager = await signedInPage(browser, "admin");
  const noa = await signedInPage(browser, "noa");
  const employee = await signedInPage(browser, "employee");
  const noaId = await employeeIdByName(manager.request, weekStart, "נועה כהן");
  const assignmentId = await assignShift(manager, noaId, weekStart, 4, "MORNING");

  try {
    // Noa offers the shift from the Requests page.
    await noa.goto("/requests");
    await noa.getByLabel("משמרת שלך למסירה").selectOption(assignmentId);
    await noa.getByRole("button", { name: "פרסום למסירה" }).click();
    await expect(noa.getByText("המשמרת פורסמה למסירה.")).toBeVisible();

    // The other employee is notified and takes it.
    await employee.goto("/requests");
    const panel = await openBell(employee);
    await expect(panel.getByText("משמרת זמינה למסירה").first()).toBeVisible();
    await employee.keyboard.press("Escape");
    await employee.goto("/requests");
    const offered = employee.locator(".requests-item").filter({ hasText: hebrewDate(addDays(weekStart, 4)) });
    await offered.getByRole("button", { name: "לקחת" }).click();
    await expect(employee.getByText("הבקשה נשלחה לאישור המנהל.")).toBeVisible();

    // The manager is notified and approves.
    await manager.goto("/requests");
    const managerPanel = await openBell(manager);
    await expect(managerPanel.getByText("מסירת משמרת ממתינה לאישורך").first()).toBeVisible();
    await manager.goto("/requests");
    const pending = manager.locator(".requests-item").filter({ hasText: hebrewDate(addDays(weekStart, 4)) });
    await pending.getByRole("button", { name: "אישור" }).click();
    await expect(manager.getByText("המסירה אושרה והסידור עודכן.")).toBeVisible();

    // Both employees get their own message.
    await noa.reload();
    await expect((await openBell(noa)).getByText(/המנהל אישר למסור את המשמרת שלך .* לעובד בדיקה/).first()).toBeVisible();
    await employee.reload();
    await expect((await openBell(employee)).getByText(/המנהל אישר לך לקחת את .* מנועה כהן/).first()).toBeVisible();

    // The schedule now shows the shift under the new employee.
    const schedule = await (await manager.request.get(`/api/schedule?weekStart=${weekStart}`)).json();
    const handedOver = schedule.assignments.find((item: { id: string }) => item.id === assignmentId);
    expect(handedOver.employeeId).not.toBe(noaId);
  } finally {
    await manager.request.delete(`/api/assignments/${assignmentId}`);
    await Promise.all([manager, noa, employee].map((page) => page.context().close()));
  }
});

test("vacation request: approval removes shifts and notifies the employee", async ({ browser }) => {
  const weekStart = futureWeekStart(6);
  const manager = await signedInPage(browser, "admin");
  const employee = await signedInPage(browser, "employee");
  const employeeId = await employeeIdByName(manager.request, weekStart, "עובד בדיקה");
  const startDate = addDays(weekStart, 1);
  const endDate = addDays(weekStart, 2);
  const assignmentId = await assignShift(manager, employeeId, weekStart, 2, "EVENING");

  try {
    await employee.goto("/requests");
    await employee.getByLabel("מתאריך").fill(startDate);
    await employee.getByLabel("עד תאריך").fill(endDate);
    await employee.getByLabel("הערה (לא חובה)").fill("בדיקה אוטומטית");
    await employee.getByRole("button", { name: "שליחת בקשת חופשה" }).click();
    await expect(employee.getByText("בקשת החופשה נשלחה למנהל.")).toBeVisible();

    await manager.goto("/requests");
    const request = manager
      .locator(".requests-item")
      .filter({ hasText: "עובד בדיקה" })
      .filter({ hasText: hebrewDate(startDate) })
      .filter({ has: manager.getByRole("button", { name: "אישור" }) });
    manager.once("dialog", (dialog) => dialog.accept());
    await request.getByRole("button", { name: "אישור" }).click();
    await expect(manager.getByText(/החופשה אושרה\. 1 משמרות הוסרו/)).toBeVisible();

    const schedule = await (await manager.request.get(`/api/schedule?weekStart=${weekStart}`)).json();
    expect(schedule.assignments.some((item: { id: string }) => item.id === assignmentId)).toBe(false);

    await employee.reload();
    await expect((await openBell(employee)).getByText("בקשת החופשה אושרה").first()).toBeVisible();
  } finally {
    await manager.request.delete(`/api/assignments/${assignmentId}`);
    await Promise.all([manager, employee].map((page) => page.context().close()));
  }
});

test("phone layout: bottom navigation and notification panel fit the screen", async ({ browser }) => {
  const noa = await signedInPage(browser, "noa", { width: 390, height: 844 });
  try {
    for (const path of ["/", "/schedule", "/requests"]) {
      await noa.goto(path);
      const rail = noa.locator(".icon-rail");
      await expect(rail).toBeVisible();
      const box = await rail.boundingBox();
      expect(box!.y + box!.height).toBeGreaterThan(800);
      // Nothing on the page is wider than the phone screen.
      const overflow = await noa.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `horizontal overflow on ${path}`).toBeLessThanOrEqual(0);
    }
    await noa.goto("/");
    await noa.locator(".icon-rail").getByTitle("בקשות").click();
    await expect(noa).toHaveURL(/\/requests$/);

    const panel = await openBell(noa);
    const panelBox = await panel.boundingBox();
    expect(panelBox!.x).toBeGreaterThanOrEqual(0);
    expect(panelBox!.x + panelBox!.width).toBeLessThanOrEqual(390);
  } finally {
    await noa.context().close();
  }
});

test("availability confirmation: employee can mark the week as done", async ({ browser }) => {
  const employee = await signedInPage(browser, "employee");
  try {
    await employee.goto("/schedule");
    const bar = employee.locator(".availability-confirm");
    await expect(bar).toBeVisible();
    const doneButton = bar.getByRole("button", { name: "סיימתי למלא" });
    if (await doneButton.isVisible()) {
      await doneButton.click();
    }
    await expect(bar).toHaveClass(/done/);
  } finally {
    await employee.context().close();
  }
});

test("installable app: manifest, icons and service worker are served", async ({ request }) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest.display).toBe("standalone");
  for (const icon of manifest.icons) {
    expect((await request.get(icon.src)).status()).toBe(200);
  }
  const worker = await request.get("/sw.js");
  expect(worker.status()).toBe(200);
  expect(await worker.text()).toContain("showNotification");
});
