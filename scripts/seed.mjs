// Local demo data for Wecom Support & Sales: 2 departments, 4 teams, ~75 people, each
// team's shifts, six weeks of schedules, availability and a few open requests.
//
//   npm run db:seed            fills an empty database
//   npm run db:seed -- --reset wipes ALL data first (local only)
//
// Everyone signs in with DEMO_PASSWORD (default LocalOnly123!). Usernames without "@"
// work at the login screen, e.g. "admin", "support", "lead1", "noa".
import { randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";
import process from "node:process";
import pg from "pg";

// Use the local .env when there is one (values already in the environment win).
try {
  process.loadEnvFile(".env");
} catch {
  // No .env file: rely on the environment.
}

const scryptAsync = promisify(scrypt);
const databaseUrl = process.env.DATABASE_URL;
const demoPassword = process.env.DEMO_PASSWORD ?? "LocalOnly123!";
const reset = process.argv.includes("--reset");
const DOMAIN = "wecomconnect.local";

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}
if (process.env.NODE_ENV === "production") {
  throw new Error("The demo seed is disabled in production");
}
if (demoPassword.length < 12) {
  throw new Error("DEMO_PASSWORD must contain at least 12 characters");
}

// Deterministic pseudo-random numbers so every run produces the same demo.
let seed = 20261002;
function random() {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}

async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = await scryptAsync(password, salt, 64);
  return `scrypt:${salt}:${derivedKey.toString("hex")}`;
}

const FIRST = [
  "נועה", "דנה", "יוסי", "מיכל", "אורי", "שירה", "איתי", "תמר", "רון", "ליאת", "עומר", "הילה", "גיא", "מאיה",
  "אלון", "רותם", "נדב", "יעל", "עידו", "שני", "תומר", "אורית", "אביב", "קרן", "דניאל", "ענבל", "אסף", "רוני",
  "ניר", "סתיו", "בן", "ליה", "עמית", "גלית", "שחר", "אדי", "מור", "יובל", "טל", "אלה", "נוי", "אייל", "רז",
  "הדר", "ספיר", "אריאל", "לירון", "שקד", "יהונתן", "ורד", "ירדן", "אופיר", "חן", "מעיין", "בר", "עדן", "אנה",
  "סהר", "זיו", "נטע", "קובי", "דור", "מתן", "נגה", "אבי", "רינת", "צחי", "כרמל", "שגיא", "אושרת", "פזית", "אליה"
];
const LAST = [
  "כהן", "לוי", "מזרחי", "פרץ", "ביטון", "אברהם", "פרידמן", "אזולאי", "דוד", "שפירא", "גולן", "בן דוד", "חדד",
  "אוחיון", "קליין", "רוזן", "שמעוני", "ברק", "טל", "אשכנזי", "נחום", "סויסה", "וקנין", "יוסף", "גבאי", "אלמוג"
];

const WEEKDAYS = { all: 127, sunThu: 0b0011111, fri: 0b0100000, friSat: 0b1100000 };

const TEAMS = [
  {
    key: "t1", department: "support", name: "תמיכה Tier 1", color: 1, size: 28, lead: "lead1",
    shifts: [
      { name: "בוקר", starts: "07:00", ends: "15:00", required: 6, weekdays: WEEKDAYS.all },
      { name: "אמצע", starts: "10:00", ends: "19:00", required: 3, weekdays: WEEKDAYS.sunThu },
      { name: "ערב", starts: "15:00", ends: "23:00", required: 5, weekdays: WEEKDAYS.all },
      { name: "לילה", starts: "23:00", ends: "07:00", required: 2, weekdays: WEEKDAYS.all }
    ]
  },
  {
    key: "t2", department: "support", name: "תמיכה Tier 2", color: 2, size: 13, lead: "lead2",
    shifts: [
      { name: "בוקר", starts: "08:00", ends: "17:00", required: 4, weekdays: WEEKDAYS.sunThu },
      { name: "ערב", starts: "13:00", ends: "22:00", required: 3, weekdays: WEEKDAYS.sunThu },
      { name: "סוף שבוע", starts: "09:00", ends: "17:00", required: 2, weekdays: WEEKDAYS.friSat }
    ]
  },
  {
    key: "s1", department: "sales", name: "מכירות נכנסות", color: 3, size: 16, lead: "lead3",
    shifts: [
      { name: "יום", starts: "09:00", ends: "18:00", required: 6, weekdays: WEEKDAYS.sunThu },
      { name: "מאוחר", starts: "12:00", ends: "21:00", required: 4, weekdays: WEEKDAYS.sunThu },
      { name: "שישי", starts: "08:00", ends: "13:00", required: 3, weekdays: WEEKDAYS.fri }
    ]
  },
  {
    key: "s2", department: "sales", name: "מכירות יוצאות", color: 4, size: 11, lead: "lead4",
    shifts: [
      { name: "יום", starts: "09:00", ends: "17:00", required: 5, weekdays: WEEKDAYS.sunThu },
      { name: "אחה״צ", starts: "13:00", ends: "20:00", required: 3, weekdays: WEEKDAYS.sunThu }
    ]
  }
];

function toMinutes(time) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}
function shiftLength(starts, ends) {
  const start = toMinutes(starts);
  const end = toMinutes(ends);
  return end > start ? end - start : end + 1440 - start;
}
function addDays(dateOnly, days) {
  const date = new Date(`${dateOnly}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
function dayIndex(dateOnly) {
  return new Date(`${dateOnly}T00:00:00.000Z`).getUTCDay();
}
function israelToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
}

// DATE columns come back as "YYYY-MM-DD" text, as in the app.
pg.types.setTypeParser(1082, (value) => value);
const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();

const [{ count }] = (await client.query("SELECT count(*)::int AS count FROM users")).rows;
if (count > 0 && !reset) {
  await client.end();
  console.error("The database already has users. Run `npm run db:seed -- --reset` to wipe it and load the demo.");
  process.exit(1);
}
if (reset) {
  await client.query(`TRUNCATE notifications, push_subscriptions, shared_files, swap_requests, shift_giveaways,
    vacation_requests, published_weeks, availability_submissions, availability_entries, shift_assignments,
    shift_templates, user_permissions, users, teams, departments, auth_login_attempts CASCADE`);
}

const passwordHash = await hashPassword(demoPassword);
const departments = {};
for (const [key, name] of [["support", "תמיכה"], ["sales", "מכירות"]]) {
  departments[key] = (await client.query("INSERT INTO departments (name) VALUES ($1) RETURNING id", [name])).rows[0].id;
}

async function addUser({ username, name, role, department = null, team = null, title = "", min = 24, max = 42 }) {
  const { rows } = await client.query(
    `INSERT INTO users (email, name, password_hash, role, department_id, team_id, title, weekly_min_hours, weekly_max_hours)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
    [`${username}@${DOMAIN}`, name, passwordHash, role, department, team, title, min, max]
  );
  return rows[0].id;
}

const users = {};
users.admin = await addUser({ username: "admin", name: "רונל (מנהל מערכת)", role: "ADMIN", title: "מנהל מערכת" });
users.support = await addUser({ username: "support", name: "שרון אלמוג", role: "DEPARTMENT_MANAGER", department: departments.support, title: "מנהלת מחלקת תמיכה" });
users.sales = await addUser({ username: "sales", name: "אלעד ברק", role: "DEPARTMENT_MANAGER", department: departments.sales, title: "מנהל מחלקת מכירות" });

const teamData = [];
let nameIndex = 0;
// The named demo accounts (נועה, דנה, יוסי) keep their first names to themselves.
const RESERVED_FIRST_NAMES = new Set(["נועה", "דנה", "יוסי"]);
function nextName() {
  while (RESERVED_FIRST_NAMES.has(FIRST[nameIndex % FIRST.length])) {
    nameIndex += 1;
  }
  const first = FIRST[nameIndex % FIRST.length];
  const last = LAST[(nameIndex * 7 + 3) % LAST.length];
  nameIndex += 1;
  return `${first} ${last}`;
}

for (const team of TEAMS) {
  const department = departments[team.department];
  const teamId = (
    await client.query("INSERT INTO teams (department_id, name, color_slot) VALUES ($1, $2, $3) RETURNING id", [department, team.name, team.color])
  ).rows[0].id;
  const templates = [];
  for (const [index, shift] of team.shifts.entries()) {
    const { rows } = await client.query(
      `INSERT INTO shift_templates (team_id, name, starts_at, ends_at, required_count, weekdays, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [teamId, shift.name, shift.starts, shift.ends, shift.required, shift.weekdays, index]
    );
    templates.push({ id: rows[0].id, ...shift, minutes: shiftLength(shift.starts, shift.ends) });
  }
  const members = [];
  const leadName = nextName();
  members.push({ id: await addUser({ username: team.lead, name: leadName, role: "TEAM_LEAD", department, team: teamId, title: "ראש צוות", min: 30, max: 45 }), max: 45 * 60 });
  users[team.lead] = members[0].id;
  for (let index = 0; index < team.size; index += 1) {
    const special = team.key === "t1" && index === 0 ? "noa" : team.key === "s1" && index === 0 ? "dana" : team.key === "t2" && index === 0 ? "yossi" : null;
    const partTime = index % 6 === 5;
    const name = special === "noa" ? "נועה כהן" : special === "dana" ? "דנה לוי" : special === "yossi" ? "יוסי מזרחי" : nextName();
    const max = partTime ? 25 : 42;
    const id = await addUser({
      username: special ?? `${team.key}.${String(index + 1).padStart(2, "0")}`,
      name,
      role: "EMPLOYEE",
      department,
      team: teamId,
      title: partTime ? "משרה חלקית" : special === "yossi" ? "נציג בכיר" : "נציג/ה",
      min: partTime ? 10 : 24,
      max
    });
    if (special) {
      users[special] = id;
    }
    members.push({ id, max: max * 60 });
  }
  teamData.push({ ...team, teamId, templates, members });
}

// Per-person extras: a senior agent in Tier 2 can approve requests and see the team's insights.
await client.query(
  "INSERT INTO user_permissions (user_id, permission) VALUES ($1, 'requests.approve'), ($1, 'reports.view')",
  [users.yossi]
);

// Schedules: five past weeks, this week and next week, filled to a realistic level.
const today = israelToday();
const thisWeek = addDays(today, -dayIndex(today));
const weeks = [-5, -4, -3, -2, -1, 0, 1].map((offset) => addDays(thisWeek, offset * 7));
const fillLevels = [0.93, 0.97, 0.9, 0.95, 0.98, 0.96, 0.82];
const assignments = [];

for (const [weekIndex, weekStart] of weeks.entries()) {
  for (const team of teamData) {
    const minutes = new Map(team.members.map((member) => [member.id, 0]));
    const byUser = new Map(team.members.map((member) => [member.id, []]));
    for (let day = 0; day < 7; day += 1) {
      const date = addDays(weekStart, day);
      for (const template of [...team.templates].sort((a, b) => a.starts.localeCompare(b.starts))) {
        if ((template.weekdays & (1 << day)) === 0) {
          continue;
        }
        const target = Math.round(template.required * Math.min(1, fillLevels[weekIndex] + (random() - 0.5) * 0.25));
        const start = day * 1440 + toMinutes(template.starts);
        const end = start + template.minutes;
        const candidates = team.members
          .filter((member) => {
            const own = byUser.get(member.id);
            if (own.some((shift) => shift.day === day)) return false;
            if (own.some((shift) => !(shift.end + 8 * 60 <= start || end + 8 * 60 <= shift.start))) return false;
            return minutes.get(member.id) + template.minutes <= member.max;
          })
          .sort((a, b) => minutes.get(a.id) - minutes.get(b.id) || random() - 0.5);
        for (const member of candidates.slice(0, target)) {
          byUser.get(member.id).push({ day, start, end });
          minutes.set(member.id, minutes.get(member.id) + template.minutes);
          assignments.push([member.id, template.id, team.teamId, date, template.starts, template.ends]);
        }
      }
    }
  }
}

for (let index = 0; index < assignments.length; index += 500) {
  const chunk = assignments.slice(index, index + 500);
  const values = chunk.map((_, row) => `($${row * 7 + 1}, $${row * 7 + 2}, $${row * 7 + 3}, $${row * 7 + 4}, $${row * 7 + 5}, $${row * 7 + 6}, $${row * 7 + 7})`);
  await client.query(
    `INSERT INTO shift_assignments (user_id, shift_template_id, team_id, work_date, starts_at, ends_at, created_by) VALUES ${values.join(", ")}`,
    chunk.flatMap((row) => [...row, users.admin])
  );
}

// This week is published for every team; next week only for the sales teams.
for (const team of teamData) {
  await client.query("INSERT INTO published_weeks (team_id, week_start, published_by) VALUES ($1, $2, $3)", [team.teamId, thisWeek, users.admin]);
  if (team.department === "sales") {
    await client.query("INSERT INTO published_weeks (team_id, week_start, published_by) VALUES ($1, $2, $3)", [team.teamId, addDays(thisWeek, 7), users.admin]);
  }
}

// Availability for the open week (two weeks ahead) from about half of each team.
const openWeek = addDays(thisWeek, 14);
for (const team of teamData) {
  for (const member of team.members.slice(0, Math.ceil(team.members.length / 2))) {
    for (let day = 0; day < 7; day += 1) {
      const roll = random();
      const date = addDays(openWeek, day);
      if (roll < 0.06) {
        await client.query("INSERT INTO availability_entries (user_id, work_date, status) VALUES ($1, $2, 'TIME_OFF')", [member.id, date]);
      } else if (roll < 0.22) {
        const template = team.templates[Math.floor(random() * team.templates.length)];
        const status = random() < 0.5 ? "PREFERRED" : "UNAVAILABLE";
        await client.query(
          "INSERT INTO availability_entries (user_id, work_date, shift_template_id, status) VALUES ($1, $2, $3, $4)",
          [member.id, date, template.id, status]
        );
      }
    }
    await client.query("INSERT INTO availability_submissions (user_id, week_start) VALUES ($1, $2)", [member.id, openWeek]);
  }
}

// A few open requests so every screen has something to show.
async function futureShiftOf(userId) {
  const { rows } = await client.query(
    `SELECT a.*, t.name AS shift_name FROM shift_assignments a JOIN shift_templates t ON t.id = a.shift_template_id
     WHERE a.user_id = $1 AND a.work_date > $2 ORDER BY a.work_date LIMIT 1`,
    [userId, today]
  );
  return rows[0];
}
const DAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
function label(shift) {
  const [, month, day] = shift.work_date.split("-");
  return `${DAY_NAMES[dayIndex(shift.work_date)]} ${day}.${month} · ${shift.shift_name} ${shift.starts_at.slice(0, 5)}-${shift.ends_at.slice(0, 5)}`;
}

const tier1 = teamData.find((team) => team.key === "t1");
const swapper = tier1.members[3].id;
const swapShift = await futureShiftOf(swapper);
if (swapShift) {
  await client.query(
    `INSERT INTO swap_requests (requester_assignment_id, requester_id, target_user_id, team_id, shift_label)
     VALUES ($1, $2, $3, $4, $5)`,
    [swapShift.id, swapper, users.noa, tier1.teamId, label(swapShift)]
  );
}
const giver = tier1.members[5].id;
const giveShift = await futureShiftOf(giver);
if (giveShift) {
  await client.query("INSERT INTO shift_giveaways (assignment_id, offered_by, team_id) VALUES ($1, $2, $3)", [giveShift.id, giver, tier1.teamId]);
}
await client.query(
  "INSERT INTO vacation_requests (user_id, start_date, end_date, note) VALUES ($1, $2, $3, 'חתונה של אח שלי')",
  [tier1.members[7].id, addDays(openWeek, 2), addDays(openWeek, 4)]
);
await client.query(
  "INSERT INTO notifications (user_id, title, body, link) VALUES ($1, $2, $3, '/schedule')",
  [users.noa, "ברוכים הבאים ל-Wecom", "כאן יופיעו התראות על הסידור, החלפות ובקשות."]
);

await client.end();
console.log(`Seeded ${teamData.reduce((sum, team) => sum + team.members.length, 0) + 3} people, ${assignments.length} shifts.`);
console.log(`Sign in with admin / support / sales / lead1-lead4 / noa / dana / yossi and password ${demoPassword === "LocalOnly123!" ? "LocalOnly123!" : "(DEMO_PASSWORD)"}.`);
