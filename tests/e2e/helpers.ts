import { expect, type Browser, type Page } from "@playwright/test";

export const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "LocalOnly123!";

export async function signIn(browser: Browser, user: string, viewport = { width: 1366, height: 900 }) {
  const context = await browser.newContext({ viewport, locale: "he-IL" });
  // Keep the "install the app" banner out of the way.
  await context.addInitScript(() => localStorage.setItem("wecomconnect-install-dismissed", String(Date.now())));
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("אימייל או שם משתמש").fill(user);
  await page.getByLabel("סיסמה").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "כניסה" }).click();
  await page.waitForURL("/");
  return page;
}

/** Calls the app's API from inside the signed-in page (so the session cookie is sent). */
export async function call<T = Record<string, unknown>>(page: Page, path: string, method = "GET", body?: unknown) {
  return page.evaluate(
    async ({ path, method, body }) => {
      const response = await fetch(path, {
        method,
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      return { status: response.status, body: (await response.json().catch(() => ({}))) as unknown };
    },
    { path, method, body }
  ) as Promise<{ status: number; body: T }>;
}

function israelToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
}

export function addDays(dateOnly: string, days: number) {
  const date = new Date(`${dateOnly}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** The Sunday `weeks` weeks from this week. */
export function weekStart(weeks: number) {
  const today = israelToday();
  const sunday = addDays(today, -new Date(`${today}T00:00:00.000Z`).getUTCDay());
  return addDays(sunday, weeks * 7);
}

export interface Shift {
  id: string;
  teamId: string;
  name: string;
  startsAt: string;
  endsAt: string;
  requiredCount: number;
  weekdays: number;
  isActive: boolean;
}

export async function teamByName(page: Page, name: string) {
  const { body } = await call<{ teams: { id: string; name: string }[]; shifts: Shift[] }>(page, "/api/org");
  const team = body.teams.find((item) => item.name === name);
  expect(team, `team ${name}`).toBeTruthy();
  return { team: team!, shifts: body.shifts.filter((shift) => shift.teamId === team!.id && shift.isActive) };
}

/** The admin's view of everyone, to look up people's emails for signing in as them. */
export async function peopleByName(admin: Page) {
  const { body } = await call<{ people: { id: string; name: string; email: string; teamId: string | null }[] }>(admin, "/api/people");
  return new Map(body.people.map((person) => [person.name, person]));
}
