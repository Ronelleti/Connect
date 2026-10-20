import { expect, test, type Page } from "@playwright/test";

const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "LocalOnly123!";

async function login(page: Page, email: string, password = E2E_PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("אימייל או שם משתמש").fill(email);
  await page.getByLabel("סיסמה").fill(password);
  await page.getByRole("button", { name: "כניסה" }).click();
  await page.waitForURL("/");
  // After login everyone lands on their personal dashboard; the schedule has its own page.
  await page.goto("/schedule");
}

test("manager sees a complete week and every employee constraint", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.addInitScript(() => {
    window.localStorage.setItem("wecomconnect-theme", "light");
  });
  await login(page, "admin");

  await expect(page.getByRole("heading", { name: "לוח משמרות שבועי" })).toBeVisible();
  await expect(page.locator(".day-header").filter({ hasText: "שישי" })).toBeVisible();
  await expect(page.locator(".day-header").filter({ hasText: "שבת" })).toBeVisible();
  await expect(page.locator(".availability-row").first()).toBeVisible();
  const employeeCount = await page.locator(".summary-item").count();
  expect(await page.locator(".availability-row").count()).toBe(Math.min(employeeCount, 5));
  await expect(page.getByText(new RegExp(`מתוך ${employeeCount}`))).toBeVisible();
  await expect(page.getByText("מעוניין לעבוד", { exact: true })).toBeVisible();
  await expect(page.getByText(/שבועיים קדימה/)).toBeVisible();
  await expect(page.getByText("חופש", { exact: true }).first()).toBeVisible();

  await page.getByTitle("סינון עובדים").click();
  const filterDrawer = page.getByRole("dialog", { name: "סינון עובדים" });
  await filterDrawer.getByRole("checkbox", { name: /בחר הכל/ }).uncheck();
  await filterDrawer.getByRole("checkbox", { name: /עובד בדיקה/ }).check();
  await filterDrawer.getByRole("checkbox", { name: /דניאל לוי/ }).check();
  await page.screenshot({ path: "/tmp/wecomconnect-availability-filter.png", fullPage: true });
  await filterDrawer.getByRole("button", { name: "הצג 2 עובדים" }).click();
  await expect(page.locator(".availability-row")).toHaveCount(2);
  await page.getByTitle("סינון עובדים").click();
  await page.getByRole("dialog", { name: "סינון עובדים" })
    .getByRole("checkbox", { name: /בחר הכל/ })
    .check();
  await page.getByRole("button", { name: new RegExp(`הצג ${employeeCount} עובדים`) }).click();
  await expect(page.locator(".availability-row")).toHaveCount(Math.min(employeeCount, 5));

  await page.getByTitle("מצב כהה").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({ path: "/tmp/wecomconnect-manager-dark.png", fullPage: true });
  await page.getByTitle("מצב בהיר").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await page.locator(".icon-rail").getByTitle("התראות").click();
  await expect(page.getByText("אין התראות חדשות.")).toBeVisible();
  const employeesNavigationButton = page.getByRole("button", { name: "עובדים", exact: true });
  await employeesNavigationButton.click();
  await expect(employeesNavigationButton).toHaveClass(/active/);
  await page.getByLabel("חיפוש עובד").fill("עובד בדיקה");
  await expect(page.locator(".summary-item")).toHaveCount(1);
  await page.getByTitle("נקה חיפוש").click();
  await page.getByTitle("החלפות").click();
  await expect(page.getByTitle("החלפות")).toHaveClass(/active/);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "ייצוא טבלה" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^wecomconnect-schedule-\d{4}-\d{2}-\d{2}\.csv$/);

  const pdfDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "PDF / שיתוף" }).click();
  const pdfDownload = await pdfDownloadPromise;
  expect(pdfDownload.suggestedFilename()).toMatch(/^wecomconnect-schedule-\d{4}-\d{2}-\d{2}\.pdf$/);
  await pdfDownload.saveAs("/tmp/wecomconnect-schedule.pdf");
  await expect(page.getByText("קובץ ה-PDF הורד בהצלחה.")).toBeVisible();

  await page.screenshot({ path: "/tmp/wecomconnect-manager.png", fullPage: true });

  const suffix = Date.now();
  const createResult = await page.evaluate(
    async (payload) => {
      const response = await fetch("/api/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      return {
        ok: response.ok,
        body: (await response.json()) as { employee?: { id: string }; error?: string }
      };
    },
    {
      name: `עובד אזהרה ${suffix}`,
      email: `warning-${suffix}@wecomconnect.local`,
      roleTitle: "בדיקת 8-8",
      weeklyMinShifts: 1,
      weeklyMaxShifts: 6,
      password: "Temporary123!"
    }
  );
  expect(createResult.ok, createResult.body.error).toBe(true);
  const createdEmployeeId = createResult.body.employee?.id;
  expect(createdEmployeeId).toBeTruthy();
  try {
    await page.reload();
    let assignmentPostCount = 0;
    let assignmentDeleteCount = 0;
    page.on("request", (request) => {
      if (request.method() === "POST" && request.url().endsWith("/api/assignments")) {
        assignmentPostCount += 1;
      }
      if (request.method() === "DELETE" && request.url().includes("/api/assignments/")) {
        assignmentDeleteCount += 1;
      }
    });
    const nightRow = page.locator(".shift-row").filter({ hasText: "לילה" });
    const eveningRow = page.locator(".shift-row").filter({ hasText: "ערב" });
    const nightCell = nightRow.locator(".shift-cell").first();
    await nightCell.locator(".add-shift").click();
    const nightPicker = nightCell.locator(".shift-worker-picker");
    await expect(nightPicker.getByRole("button", { name: "שמור" })).toBeDisabled();
    await nightPicker.getByRole("option", { name: new RegExp(`עובד אזהרה ${suffix}`) }).click();
    await expect(nightPicker.getByRole("button", { name: "שמור" })).toBeEnabled();
    expect(assignmentPostCount).toBe(0);
    await page.screenshot({ path: "/tmp/wecomconnect-worker-picker.png", fullPage: true });
    await nightPicker.getByRole("button", { name: "שמור" }).click();
    await expect(page.getByText("השיבוץ נשמר.")).toBeVisible();
    expect(assignmentPostCount).toBe(1);
    const newAssignment = nightCell.locator(".employee-chip").filter({ hasText: `עובד אזהרה ${suffix}` });
    await newAssignment.getByTitle("הסר שיבוץ").click();
    await expect(page.getByText(/המחיקה תישמר בעוד .* שניות/)).toBeVisible();
    expect(assignmentDeleteCount).toBe(0);
    await page.getByRole("button", { name: "ביטול המחיקה" }).click();
    await expect(newAssignment).toBeVisible();
    expect(assignmentDeleteCount).toBe(0);
    const eveningCell = eveningRow.locator(".shift-cell").nth(1);
    await eveningCell.locator(".add-shift").click();
    const eveningPicker = eveningCell.locator(".shift-worker-picker");
    await eveningPicker.getByRole("option", { name: new RegExp(`עובד אזהרה ${suffix}`) }).click();
    await eveningPicker.getByRole("button", { name: "שמור" }).click();
    await expect(page.getByRole("heading", { name: "נדרש אישור חריגה" })).toBeVisible();
    await expect(page.getByText(/אזהרת 8-8/)).toBeVisible();
    await page.getByRole("button", { name: "ביטול" }).click();
  } finally {
    if (createdEmployeeId) {
      await page.evaluate(async (employeeId) => {
        await fetch(`/api/employees/${employeeId}`, { method: "DELETE" });
      }, createdEmployeeId);
    }
  }
});

test("manager can add, edit, constrain, and delete an employee", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page, "admin");

  const suffix = Date.now();
  const originalName = `עובד זמני ${suffix}`;
  const updatedName = `עובד מעודכן ${suffix}`;
  let createdEmployeeId = "";

  try {
    await page.getByTitle("הוספת עובד").click();
    const dialog = page.getByRole("dialog", { name: "הוספת עובד" });
    await dialog.getByLabel("שם מלא").fill(originalName);
    await dialog.getByLabel("אימייל").fill(`temporary-${suffix}@wecomconnect.local`);
    await dialog.getByLabel("תפקיד").fill("נוקיסט בדיקה");
    await dialog.getByLabel("מינימום משמרות").fill("2");
    await dialog.getByLabel("מקסימום משמרות").fill("5");
    await dialog.getByLabel("סיסמה").fill("Temporary123!");
    const createResponsePromise = page.waitForResponse(
      (response) => response.url().endsWith("/api/employees") && response.request().method() === "POST"
    );
    await dialog.getByRole("button", { name: "שמירה" }).click();
    const createResponse = await createResponsePromise;
    createdEmployeeId = ((await createResponse.json()) as { employee: { id: string } }).employee.id;
    await expect(page.getByText("העובד נוסף למערכת.")).toBeVisible();
    await expect(page.locator(".summary-item").filter({ hasText: originalName })).toBeVisible();

    await page.getByTitle("סינון עובדים").click();
    const filterDrawer = page.getByRole("dialog", { name: "סינון עובדים" });
    await filterDrawer.getByRole("checkbox", { name: /בחר הכל/ }).uncheck();
    await filterDrawer.getByRole("checkbox", { name: new RegExp(originalName) }).check();
    await filterDrawer.getByRole("button", { name: "הצג עובד אחד" }).click();
    const availabilityRow = page.locator(".availability-row").filter({ hasText: originalName });
    const firstConstraint = availabilityRow.locator("select").first();
    await expect(firstConstraint).toBeEnabled();
    await firstConstraint.selectOption("UNAVAILABLE");
    await expect(page.getByText("הזמינות עודכנה.")).toBeVisible();
    await expect(firstConstraint).toHaveValue("UNAVAILABLE");

    await page.getByTitle(`עריכת ${originalName}`).click();
    const editDialog = page.getByRole("dialog", { name: "עריכת עובד" });
    await editDialog.getByLabel("שם מלא").fill(updatedName);
    await editDialog.getByLabel("תפקיד").fill("אחראי לילה");
    await editDialog.getByRole("button", { name: "שמירה" }).click();
    await expect(page.getByText("פרטי העובד עודכנו.")).toBeVisible();
    await expect(page.locator(".summary-item").filter({ hasText: updatedName })).toBeVisible();

    await page.getByTitle(`מחיקת ${updatedName}`).click();
    await expect(page.getByRole("heading", { name: `מחיקת ${updatedName}` })).toBeVisible();
    await page.getByRole("button", { name: "מחיקת עובד", exact: true }).click();
    await expect(page.getByText("העובד נמחק מהמערכת.")).toBeVisible();
    await expect(page.locator(".summary-item").filter({ hasText: updatedName })).toHaveCount(0);
    createdEmployeeId = "";
  } finally {
    if (createdEmployeeId) {
      await page.context().request.delete(`/api/employees/${createdEmployeeId}`);
    }
  }
});

test("regular employee can use their availability controls", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, "employee");

  const ownRow = page.locator(".availability-row").filter({ hasText: "עובד בדיקה" });
  await expect(page.locator(".add-shift")).toHaveCount(0);
  await expect(page.locator(".shift-worker-picker")).toHaveCount(0);
  await expect(page.getByTitle("הוספת עובד")).toHaveCount(0);
  await expect(page.locator(".employee-shift-state")).toHaveCount(21);
  const ownSelect = ownRow.locator("select").first();
  await expect(ownSelect).toBeEnabled();
  await ownSelect.selectOption("PREFERRED");
  await expect(page.getByText("הזמינות עודכנה.")).toBeVisible();
  await expect(ownSelect).toHaveValue("PREFERRED");

  const otherRow = page.locator(".availability-row").filter({ hasText: "דניאל לוי" });
  await expect(otherRow).toBeVisible();
  await expect(otherRow.locator("select").first()).toBeDisabled();
  await expect(otherRow.locator(".time-off-toggle").first()).toBeDisabled();
  await page.screenshot({ path: "/tmp/wecomconnect-employee-mobile.png", fullPage: true });

  await ownSelect.selectOption("AVAILABLE");
  await expect(page.getByText("הזמינות עודכנה.")).toBeVisible();
});
