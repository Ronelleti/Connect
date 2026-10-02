import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test("an employee marks preferences, a day off, and finishes the week", async ({ browser }) => {
  const noa = await signIn(browser, "noa");
  try {
    await noa.goto("/availability");
    await expect(noa.locator(".availability-day").first()).toBeVisible();
    // Use the week after the open one, which the demo data leaves empty.
    const openWeekLabel = await noa.locator(".week-label").textContent();
    await noa.getByRole("button", { name: "השבוע הבא" }).click();
    await expect(noa.locator(".week-label")).not.toHaveText(openWeekLabel!);
    await expect(noa.locator(".availability-day").first()).toContainText(/\d{2}\.\d{2}/);
    const day = noa.locator(".availability-day").nth(1);
    const dayOff = day.getByRole("button", { name: /יום חופש/ });

    // Undo what an earlier run may have left: a day off, or a marked shift.
    if ((await dayOff.getAttribute("aria-pressed")) === "true") {
      await dayOff.click();
      await expect(dayOff).toHaveAttribute("aria-pressed", "false");
    }
    const toggle = day.locator(".availability-toggle").first();
    for (let attempt = 0; attempt < 3 && !(await toggle.getAttribute("aria-label"))!.includes("זמין/ה."); attempt += 1) {
      await toggle.click();
      await noa.waitForTimeout(400);
    }

    // Each tap cycles: available → prefer → can't → available.
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-label", /מעדיף\/ה/);
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-label", /לא יכול\/ה/);
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-label", /זמין\/ה\./);

    await dayOff.click();
    await expect(dayOff).toHaveAttribute("aria-pressed", "true");
    await expect(day.locator(".availability-shifts")).toContainText("יום חופש");

    await noa.getByRole("button", { name: /סיימתי/ }).click();
    await expect(noa.locator(".badge", { hasText: "מילאת את השבוע הזה" })).toBeVisible();
  } finally {
    await noa.context().close();
  }
});
