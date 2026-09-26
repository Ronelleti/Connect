import { expect, test, type Browser } from "@playwright/test";

const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "LocalOnly123!";

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
const SAMSUNG_INTERNET =
  "Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36";

async function phonePage(browser: Browser, userAgent: string, initScript?: () => void) {
  const context = await browser.newContext({
    userAgent,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    locale: "he-IL"
  });
  if (initScript) {
    await context.addInitScript(initScript);
  }
  return context.newPage();
}

test("iPhone: install banner opens the add-to-home-screen steps", async ({ browser }) => {
  const page = await phonePage(browser, IPHONE_SAFARI);
  try {
    await page.goto("/login");
    const banner = page.locator(".install-banner");
    await expect(banner).toBeVisible();
    await banner.getByRole("button", { name: "התקנה", exact: true }).click();

    const dialog = page.getByRole("dialog", { name: "התקנה באייפון" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("הוספה למסך הבית");
    await expect(dialog).toContainText("הפעלת התראות");
    const box = await dialog.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    // Closing the banner hides it on later visits, but the top-bar button stays.
    await banner.getByRole("button", { name: "סגירת הצעת ההתקנה" }).click();
    await expect(banner).toBeHidden();
    await page.getByLabel("אימייל או שם משתמש").fill("noa");
    await page.getByLabel("סיסמה").fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "כניסה" }).click();
    await page.waitForURL("/");
    await expect(page.locator(".install-banner")).toBeHidden();
    await page.getByRole("button", { name: "התקנת האפליקציה בטלפון" }).click();
    await expect(page.getByRole("dialog", { name: "התקנה באייפון" })).toBeVisible();
  } finally {
    await page.context().close();
  }
});

test("Samsung Internet: shows the Samsung menu steps", async ({ browser }) => {
  const page = await phonePage(browser, SAMSUNG_INTERNET);
  try {
    await page.goto("/login");
    await page.locator(".install-banner").getByRole("button", { name: "התקנה", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "התקנה בסמסונג" });
    await expect(dialog).toContainText("מסך הבית");
  } finally {
    await page.context().close();
  }
});

test("Android: the install button opens the browser's own install window", async ({ browser }) => {
  const page = await phonePage(browser, ANDROID_CHROME);
  try {
    await page.goto("/login");
    await page.evaluate(() => {
      const event = new Event("beforeinstallprompt", { cancelable: true }) as Event & {
        prompt: () => Promise<void>;
        userChoice: Promise<{ outcome: string }>;
      };
      event.prompt = async () => {
        (window as unknown as { promptShown: boolean }).promptShown = true;
      };
      event.userChoice = Promise.resolve({ outcome: "accepted" });
      window.dispatchEvent(event);
    });
    await page.locator(".install-banner").getByRole("button", { name: "התקנה", exact: true }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { promptShown?: boolean }).promptShown)).toBe(true);
    await expect(page.getByRole("dialog")).toBeHidden();

    await page.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
    await expect(page.locator(".install-banner")).toBeHidden();
  } finally {
    await page.context().close();
  }
});

test("installed app: no install prompts when opened from the home screen", async ({ browser }) => {
  const page = await phonePage(browser, IPHONE_SAFARI, () => {
    Object.defineProperty(navigator, "standalone", { value: true });
  });
  try {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "כניסה למערכת" })).toBeVisible();
    await expect(page.locator(".install-banner")).toHaveCount(0);
  } finally {
    await page.context().close();
  }
});
