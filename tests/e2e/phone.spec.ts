import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test("phone layout: bottom tabs and no sideways scrolling", async ({ browser }) => {
  const noa = await signIn(browser, "noa", { width: 390, height: 844 });
  try {
    for (const path of ["/", "/schedule", "/availability", "/requests", "/people", "/files"]) {
      await noa.goto(path);
      await expect(noa.getByRole("navigation", { name: "ניווט", exact: true })).toBeVisible();
      await noa.waitForLoadState("networkidle");
      const overflow = await noa.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `horizontal overflow on ${path}`).toBeLessThanOrEqual(0);
    }
    await noa.goto("/schedule");
    await expect(noa.locator(".day-tabs")).toBeVisible();
    await noa.getByRole("navigation", { name: "ניווט", exact: true }).getByRole("button", { name: "עוד" }).click();
    await expect(noa.getByRole("menuitem", { name: "קבצים" })).toBeVisible();
  } finally {
    await noa.context().close();
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
