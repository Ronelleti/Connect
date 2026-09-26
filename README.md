# Wecomconnect

Wecomconnect is a shift-management SaaS prototype for teams that work three daily shifts:

- Morning: 07:00-15:00
- Evening: 15:00-23:00
- Night: 23:00-07:00

The app focuses on a comfortable weekly scheduling workflow, employee availability, conflict warnings, exports, and manager-approved shift swaps.

## Stack

- Next.js + React + TypeScript
- Node route handlers
- PostgreSQL
- Vitest
- Playwright

## Local Setup

```bash
cp .env.example .env
docker compose up -d postgres
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

## Docker Setup

```bash
cp .env.example .env
docker compose up --build
```

The `app` service waits for PostgreSQL, runs the schema migration, and starts Next.js on `http://localhost:3000`. Run `npm run db:seed` separately when you want local demo data.

The seed creates local manager and employee fixtures using `DEMO_PASSWORD`
(or a local-only default). The script refuses to run when `NODE_ENV=production`.

## Netlify Deployment

1. Connect this GitHub repository to a new Netlify project.
2. In the project, open **Database** and initialize Netlify Database, or run `netlify database init --yes` from a linked checkout.
3. Add a strong `AUTH_SECRET` under **Project configuration → Environment variables**.
4. Deploy the branch. Netlify detects `@netlify/database`, provisions PostgreSQL, and applies the SQL files under `netlify/database/migrations/` before publishing.
5. Create the first manager once with `npm run db:create-admin`, using the production database connection temporarily as `DATABASE_URL` and setting `ADMIN_EMAIL`, `ADMIN_NAME`, and `ADMIN_PASSWORD` locally.

Public registration is disabled. Managers create employee accounts from the dashboard;
the first manager is bootstrapped once with the production-safe admin script.

## Scheduling Rules

- The visible schedule is Sunday through Saturday, with a current date for every day.
- The availability panel always targets the Sunday-through-Saturday week two weeks ahead, independently of the schedule week being viewed.
- Employees can receive up to 6 shifts per week.
- Unmarked availability is treated as available. Employees can mark a shift as preferred or unavailable and can set a full-day vacation (`חופש`) status.
- An employee must have at least 8 hours of rest between shifts: back-to-back shifts (or any gap under 8 hours) are blocked, including across the Saturday-night/Sunday-morning week boundary and in swap requests. Exactly 8 hours of rest (the "8-8" case) and availability conflicts require a manager warning confirmation but do not prevent an intentional assignment.
- Weekly summaries show shift count and work hours per employee.
- Every shift can contain only one employee. Replacing an occupied shift requires an explicit manager confirmation.
- Assigned names are bold and colored by shift: morning green, evening yellow, and night red.
- Managers can export a UTF-8 CSV table containing employee, day, date, shift, time, and weekly totals.
- Swap requests can be reviewed by the target employee and manager in either order. A rejection closes the request immediately; after both approve, the assignment is applied automatically.
- Only one active swap request is allowed per source assignment; older duplicate requests are closed automatically when the database is migrated.
- If `MANAGER_APPROVAL_EMAIL` is configured, submitting a swap request emails that address with one-click approve/decline links, so a manager can respond without opening the app. The link only shows a confirmation page on click; the decision itself is applied when that confirmation is submitted, so link-prefetching by email scanners can't silently approve or decline a swap. This is an additional channel — the in-app manager approval buttons work exactly as before, and the swap is still only applied once both the target employee and a manager (via either channel) have approved.
- Managers can auto-generate a week's schedule with one click. The generator only fills currently empty shifts (existing assignments are left untouched) and, for each empty shift, prefers an employee who marked it as preferred, honors `UNAVAILABLE`/`חופש` blocks, and never exceeds an employee's weekly shift cap. It aims for at least 16 hours of rest (two other shifts) between any two of an employee's shifts; only when no employee can otherwise cover a shift does it fall back to 8 hours of rest. It never schedules back-to-back shifts, including across the week boundary; if a shift can't be covered with at least 8 hours of rest, it is left unfilled. Any shift nobody can cover is left unfilled and reported for manual assignment.

## Personal Dashboard and Shared Files

- After login, employees land on a personal dashboard (`/`) showing their name, shift count and hours worked this week and this month, and their next upcoming shift. Managers without a linked employee record see a simplified version pointing them to the schedule. The full schedule grid moved to `/schedule`; navigate between the dashboard, schedule, and files from the icon rail.
- `/files` is a shared library where any signed-in user can upload a PDF, Word (`.docx`), Excel (`.xlsx`/`.xlsm`), CSV, or text file (5MB limit) for everyone to view and download. A file can be deleted by whoever uploaded it or by any manager.
- The Files page is gated behind a shared access code (`FILES_ACCESS_CODE`): every user must enter it once before they can view, ask about, or download anything there. Entering it correctly unlocks the page for 30 days per browser. If the code isn't configured, the page stays locked for everyone rather than opening by default.
- If `ANTHROPIC_API_KEY` is configured, each file gets an "ask a question" thread where anyone can ask about its content and get an AI-generated answer based only on the extracted text; the question and answer are saved so others can see the thread. Without that key, uploads/downloads still work, but asking a question returns a clear "not configured" message instead of an answer.

## Salary Estimate

- `/salary` shows each signed-in employee an estimate of their own pay; nobody else (including managers) can see another person's wage or estimate.
- The pay period runs from the 20th of one month through the 19th of the next, and is paid on the 10th of the month after the period ends (e.g. 20.08-19.09 is paid on 10.10). Earlier and later periods can be browsed.
- Each employee enters their own hourly wage and tax credit points. Morning and evening hours are paid at the hourly wage and night-shift hours at 125%. All shifts assigned in the period count, including ones not yet worked.
- The net figure is a rough estimate: income tax brackets, national insurance/health tax and a 6% employee pension deduction, using the constants in `src/lib/salary.ts` (2025 values; update them there when they change).

## Notifications, Requests and the Phone App

- **Notifications:** a bell in the top bar lists each user's notifications with an unread count. With `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` configured (generate them once with `npx web-push generate-vapid-keys`), users can also turn on phone/desktop push notifications from the bell.
- **Install as an app:** the site ships a web app manifest, icons and a service worker, so it can be added to a phone's home screen and opens full screen. On iPhone, push notifications only work after "Add to Home Screen" (iOS 16.4+).
  - On phones, the login page and every signed-in page show an "התקנה" banner (dismissible for 14 days); a phone icon in the top bar stays available after it's closed. Nothing is shown once the app runs from the home screen.
  - On Android (Chrome, Samsung Internet) the button opens the browser's own install window when the browser offers one. Otherwise, and always on iPhone, it opens step-by-step instructions for the visitor's phone and browser: Safari, other iPhone browsers, Samsung Internet, Chrome, or a social app's built-in browser (which must be opened in a real browser first). Platform detection lives in `src/lib/installPlatform.ts`.
  - The installed iPhone app keeps its own login, separate from Safari, so users sign in once more inside it.
- **Publishing a week:** managers press "פרסום הסידור" on the schedule page when a week is ready (the confirmation warns about shifts still empty). Every active employee gets a notification, on the bell and as a phone notification, listing their own shifts that week; tapping it opens `/schedule?week=<Sunday>`. Pressing it again later ("שליחת עדכון על הסידור") sends an "updated schedule" notification. Published weeks are stored in `published_weeks`.
- **Swaps:** the target employee is notified of a request; when they accept, the requester is told and managers are asked to approve; when a manager approves or declines, both employees are notified.
- **Shift giveaways** (`/requests`): an employee offers one of their future shifts to everyone; another employee takes it (rest, weekly-limit and vacation rules apply); managers approve the handover. Each step notifies the people involved.
- **Vacation requests** (`/requests`): employees request a date range; managers approve or decline. Approval marks every day as full-day vacation (`חופש`) and removes the employee's shifts on those days, leaving them empty for the manager to refill. Swaps and giveaways can't hand a shift to someone on a vacation day.
- **Availability reminder:** every Sunday at 06:00 UTC the Netlify scheduled function `netlify/functions/availability-reminder.mts` reminds employees who haven't filled in the week that is open for availability (deadline: Tuesday). Employees count as done once they change any availability or press "סיימתי למלא". Requires `CRON_SECRET`.

## Security

- The session cookie is encrypted and authenticated, `HttpOnly`, `SameSite=Lax`, and `Secure` in production. Sessions expire after eight hours.
- Every API request reloads the current user and role from PostgreSQL before applying manager or employee permissions.
- Public registration is disabled; only a manager can create employee accounts.
- Login failures are rate-limited and security response headers are enabled.
- Browser local storage contains only the light/dark theme preference. Authentication data and employee data are not stored there.

## Verification

```bash
npm run test
npm run lint
npm run build
npm run test:e2e
```

The end-to-end tests expect the Docker stack on `http://localhost:3000` and use the locally installed Google Chrome binary.
