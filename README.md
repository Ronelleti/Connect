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
- Availability conflicts and rest gaps of 8 hours or less require a manager warning confirmation but do not prevent an intentional assignment.
- Weekly summaries show shift count and work hours per employee.
- Every shift can contain only one employee. Replacing an occupied shift requires an explicit manager confirmation.
- Assigned names are bold and colored by shift: morning green, evening yellow, and night red.
- Managers can export a UTF-8 CSV table containing employee, day, date, shift, time, and weekly totals.
- Swap requests can be reviewed by the target employee and manager in either order. A rejection closes the request immediately; after both approve, the assignment is applied automatically.
- Only one active swap request is allowed per source assignment; older duplicate requests are closed automatically when the database is migrated.
- If `MANAGER_APPROVAL_EMAIL` is configured, submitting a swap request emails that address with one-click approve/decline links, so a manager can respond without opening the app. The link only shows a confirmation page on click; the decision itself is applied when that confirmation is submitted, so link-prefetching by email scanners can't silently approve or decline a swap. This is an additional channel — the in-app manager approval buttons work exactly as before, and the swap is still only applied once both the target employee and a manager (via either channel) have approved.
- Managers can auto-generate a week's schedule with one click. The generator only fills currently empty shifts (existing assignments are left untouched) and, for each empty shift, prefers an employee who marked it as preferred, honors `UNAVAILABLE`/`חופש` blocks, and never exceeds an employee's weekly shift cap. It never schedules the same employee for two shifts in a row, and requires at least two other shifts (16h) of rest between any two of an employee's shifts; only when no employee can otherwise cover a shift does it relax that rest rule as a last resort. Any shift nobody can cover is left unfilled and reported for manual assignment.

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
