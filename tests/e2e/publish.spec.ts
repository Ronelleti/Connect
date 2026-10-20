import { expect, test, type Browser } from "@playwright/test";

const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "LocalOnly123!";

async function signedInPage(browser: Browser, email: string) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "he-IL" });
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("אימייל או שם משתמש").fill(email);
  await page.getByLabel("סיסמה").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "כניסה" }).click();
  await page.waitForURL("/");
  return page;
}

test("publishing a week notifies employees and links to that week", async ({ browser }) => {
  const manager = await signedInPage(browser, "admin");
  const noa = await signedInPage(browser, "noa");
  try {
    // A week far ahead so it doesn't collide with the other tests' weeks.
    await manager.goto("/schedule");
    for (let week = 0; week < 8; week += 1) {
      await manager.locator(".toolbar-controls .soft-button").nth(1).click();
    }
    await manager.getByRole("button", { name: /פרסום הסידור|שליחת עדכון על הסידור/ }).click();
    const dialog = manager.getByRole("dialog");
    await expect(dialog).toContainText("המשמרות שלהם");
    await dialog.getByRole("button", { name: /פרסום ושליחה|שליחת עדכון/ }).click();
    await expect(manager.locator(".toast")).toContainText("עובדים");
    await expect(manager.locator(".published-pill")).toBeVisible();
    await expect(manager.getByRole("button", { name: "שליחת עדכון על הסידור" })).toBeVisible();

    await noa.reload();
    await noa.locator(".notification-bell > button").click();
    const item = noa.locator(".notification-item").filter({ hasText: /הסידור לשבוע .* (מוכן|עודכן)/ }).first();
    await expect(item).toBeVisible();
    await item.click();
    await expect(noa).toHaveURL(/\/schedule\?week=\d{4}-\d{2}-\d{2}$/);
    const week = new URL(noa.url()).searchParams.get("week")!;
    const [, month, day] = week.split("-");
    await expect(noa.locator(".week-pill")).toContainText(`${day}.${month}`);
  } finally {
    await manager.context().close();
    await noa.context().close();
  }
});
