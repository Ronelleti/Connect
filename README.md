# Wecom Connect · Support & Sales

Shift scheduling for the support and sales departments: many people, split into teams,
where each team defines its own shifts and how many people each one needs. Built from the
NOC app (`WecomV3`) with a new scheduling core, roles with per-person permissions, and a
more visual interface (Hebrew, right-to-left, light/dark, installable on phones).

## What it does

- **Teams and shifts.** Departments contain teams. Each team has its own shift types (e.g.
  09:00-18:00, 12:00-21:00, overnight 23:00-07:00) with the number of people needed and the
  days they run. Shifts are archived, not deleted, so past schedules keep their hours.
- **Planner** (`/schedule`). A team's week by shift (who works each shift, with
  staffed/needed badges) or by person (each person's week and hours against their weekly
  limit). Clicking a shift opens a picker that ranks the team: people who prefer the shift,
  then available people, then those that need confirmation (day off, unavailable, over
  their weekly hours) and those who can't be scheduled (overlap, less than 8 hours of rest).
  **Auto-fill** fills open positions; **publish** notifies every team member (bell + phone)
  with their own shifts; **export** downloads a CSV for Excel. On phones the planner shows
  one day at a time.
- **Availability** (`/availability`). Each person marks shifts they prefer or can't do, or a
  whole day off, for the week that's open (two weeks ahead), then presses "סיימתי". A
  Netlify scheduled function reminds those who haven't, every Sunday.
- **Requests** (`/requests`). Swaps with a teammate (optionally exchanging shifts), a
  giveaway board for the team, and vacation requests. Swaps and giveaways need the
  colleague's agreement and then an approver; approving re-checks rest and overlap rules.
  An approved vacation marks the days off and removes those shifts. Every step notifies the
  people involved.
- **Insights** (`/insights`). For one team or all teams in scope: coverage %, open slots,
  hours, people on time off and pending approvals, with a 6-week coverage trend; coverage by
  team and by day; a heatmap of how many people work in each hour of the week; and hours
  per person against their weekly maximum. Every chart has a table view.
- **People** (`/people`) and **Teams & shifts** (`/settings`). Directory with team filters;
  managers add and edit people; admins switch per-person permissions on or off.
- **Home** (`/`). Next shift, this week, hours against the weekly limit, who in the team is
  on shift right now, and what's waiting for you.
- **Files**, **notifications** (bell + Web Push) and **install as an app** work as in the NOC app.

## Roles and permissions

Everyone has a role; a role comes with default permissions. An admin can switch on extra
permissions for one person. A permission only applies inside the person's scope.

| Role | Scope | Default permissions |
| --- | --- | --- |
| Admin (מנהל מערכת) | Everything | All, plus departments, teams and per-person permissions |
| Department manager (מנהל מחלקה) | Their department's teams | All seven below |
| Team lead (ראש צוות) | Their team | Edit schedule, publish, approve requests, view insights |
| Employee (עובד/ת) | Their team | None (own schedule, availability, requests) |

Permissions: `schedule.edit`, `schedule.publish`, `requests.approve`, `reports.view`,
`shifts.configure`, `people.manage`, `department.view` (see the whole department's
schedules). Nobody can create or edit someone at or above their own role (admins aside),
and the last active admin can't be demoted or deactivated. The rules live in
`src/lib/permissions.ts` and are checked on the server for every request.

## Scheduling rules

- Overlapping shifts and less than 8 hours of rest between shifts are never allowed.
- Scheduling someone on a day off, a shift they marked as unavailable, or past their weekly
  maximum hours needs the scheduler's confirmation.
- A shift that doesn't run on that weekday can't be scheduled.
- Auto-fill only fills empty positions, never puts someone on two shifts in one day, keeps
  8 hours of rest and weekly maximums, skips days off and "can't", and picks people who
  prefer the shift first, then whoever is furthest below their weekly minimum, then whoever
  has the fewest hours.
- Coverage counts each shift up to its target, so overstaffing one shift doesn't hide a gap
  in another.

## Local setup

```bash
cp .env.example .env
docker compose up -d postgres
npm install
npm run db:migrate
npm run db:seed
npm run build && npm start      # or: npm run dev
```

The database scripts read `.env` themselves. `npm run db:seed` loads a demo (2 departments,
4 teams, ~75 people, six weeks of schedules, availability and open requests) into an empty
database; `npm run db:seed -- --reset` wipes all data first. It refuses to run in
production. Everyone signs in with `DEMO_PASSWORD` (default `LocalOnly123!`); usernames
without `@` work at the login screen:

| Username | Who |
| --- | --- |
| `admin` | Admin |
| `support`, `sales` | Department managers |
| `lead1`-`lead4` | Team leads (Tier 1, Tier 2, inbound sales, outbound sales) |
| `noa`, `dana` | Employees (Tier 1, inbound sales) |
| `yossi` | Tier 2 employee with extra permissions (approve requests, view insights) |

To try it on a phone, phones need https: run `npx cloudflared tunnel --protocol http2 --url http://localhost:3000`
and open the printed `https://….trycloudflare.com` address.

## Tests

```bash
npm test          # unit tests (permissions, scheduling, insights, ...)
npm run lint
npm run test:e2e  # browser tests; needs the demo data and a running app
```

The browser tests use `E2E_BASE_URL` (default `http://127.0.0.1:3000`) and `CHROME_PATH`
(default `/usr/bin/google-chrome`). They create their own data in future weeks, so they can
run again without reseeding.

## Netlify deployment

Deploy this branch as **its own Netlify site with its own database**. Its schema
(`netlify/database/migrations/20261002000100_support_sales_schema.sql`, same as
`db/schema.sql`) is not compatible with the NOC app's database.

1. Create a Netlify project from this repository and set the production branch to `SupportSales`.
2. Under **Database**, initialize Netlify Database (or `netlify database init --yes`).
3. Under **Project configuration → Environment variables** add (redeploy after changes):

   | Variable | What it is | How to get it |
   | --- | --- | --- |
   | `AUTH_SECRET` | Signs and encrypts login sessions. Required. | Any long random value, e.g. `openssl rand -hex 32`. |
   | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Identify this server to Apple's and Google's push services, for phone notifications. The private key is secret. | `npx web-push generate-vapid-keys`, once, on any computer. Keep both; changing them makes everyone re-enable notifications. |
   | `VAPID_SUBJECT` | A contact address for the push services; users never see it. | `mailto:` plus your email. |
   | `CRON_SECRET` | Lets only the Sunday reminder function call `/api/cron/availability-reminder`. | Make one up, e.g. `openssl rand -hex 32`. |
   | `FILES_ACCESS_CODE` | The code everyone types once to open the Files page. | Choose it yourself. |

4. Deploy. Netlify applies the migration before publishing; the Sunday reminder only runs on
   the published production deploy.
5. Create the first admin once: `npm run db:create-admin` with `DATABASE_URL` set to the
   production database and `ADMIN_EMAIL`, `ADMIN_NAME`, `ADMIN_PASSWORD` (12+ characters).
   Then, signed in as that admin, create departments and teams in **Teams & shifts**, define
   each team's shifts, and add people in **People**.
6. On each phone: open the site, install it from the "התקנה" banner, sign in, and turn on
   notifications from the bell.

## Code map

- `src/lib/` — pure logic shared by server and browser: `permissions.ts`, `scheduling.ts`
  (validation, coverage, auto-fill), `shiftTime.ts`, `insights.ts`, `schedulePublish.ts`,
  `scheduleExport.ts`, `dates.ts`, `labels.ts`.
- `src/server/` — database access (`people.ts`, `org.ts`, `schedule.ts`, `requests.ts`,
  `files.ts`, `notifications.ts`), session/auth, and permission helpers (`access.ts`, `shell.ts`).
- `src/app/api/` — route handlers; each checks the signed-in person's permission for the team.
- `src/components/views/` — one view per screen; `charts/` holds the chart components
  (stat tiles, sparkline, heatmap, bars) built on the tokens in `src/app/globals.css`.
