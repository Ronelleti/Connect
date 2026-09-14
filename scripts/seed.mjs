import { randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";
import process from "node:process";
import pg from "pg";

const scryptAsync = promisify(scrypt);
const databaseUrl = process.env.DATABASE_URL;
const demoPassword = process.env.DEMO_PASSWORD ?? "LocalOnly123!";

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}
if (process.env.NODE_ENV === "production") {
  throw new Error("The demo seed is disabled in production");
}
if (demoPassword.length < 12) {
  throw new Error("DEMO_PASSWORD must contain at least 12 characters");
}

async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = await scryptAsync(password, salt, 64);
  return `scrypt:${salt}:${derivedKey.toString("hex")}`;
}

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();

const demoPasswordHash = await hashPassword(demoPassword);

await client.query(
  `INSERT INTO users (email, name, password_hash, role)
   VALUES
    ('manager@wecomconnect.local', 'מנהל מערכת', $1, 'MANAGER'),
    ('noa@wecomconnect.local', 'נועה כהן', $1, 'EMPLOYEE'),
    ('admin@wecomconnect.local', 'מנהל ראשי', $1, 'MANAGER'),
    ('employee@wecomconnect.local', 'עובד בדיקה', $1, 'EMPLOYEE')
   ON CONFLICT (email) DO UPDATE SET
    name = EXCLUDED.name,
    password_hash = EXCLUDED.password_hash,
    role = EXCLUDED.role`,
  [demoPasswordHash]
);

await client.query(
  `INSERT INTO employees (user_id, name, email, role_title, weekly_min_shifts, weekly_max_shifts)
   SELECT id, name, email, 'עובד/ת משמרת', 1, 6
   FROM users
   WHERE email IN ('noa@wecomconnect.local', 'employee@wecomconnect.local')
   ON CONFLICT (email) DO UPDATE SET
    user_id = EXCLUDED.user_id,
    name = EXCLUDED.name,
    weekly_max_shifts = 6`
);

await client.query(
  `INSERT INTO employees (name, email, role_title, weekly_min_shifts, weekly_max_shifts)
   VALUES
    ('דניאל לוי', 'daniel@wecomconnect.local', 'אחראי משמרת', 2, 6),
    ('מאיה אברהם', 'maya@wecomconnect.local', 'עובדת משמרת', 1, 6),
    ('איתי ברק', 'itai@wecomconnect.local', 'עובד משמרת', 1, 6),
    ('שירה מזרחי', 'shira@wecomconnect.local', 'עובדת משמרת', 1, 6)
   ON CONFLICT (email) DO UPDATE SET weekly_max_shifts = 6`
);

await client.end();
console.log("Seed data is ready.");
