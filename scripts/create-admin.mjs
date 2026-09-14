import { randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";
import process from "node:process";
import pg from "pg";

const scryptAsync = promisify(scrypt);
const databaseUrl = process.env.DATABASE_URL ?? process.env.NETLIFY_DB_URL;
const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const name = process.env.ADMIN_NAME?.trim() || "Administrator";
const password = process.env.ADMIN_PASSWORD ?? "";

if (!databaseUrl) {
  throw new Error("DATABASE_URL or NETLIFY_DB_URL is required");
}
if (!email || !email.includes("@")) {
  throw new Error("ADMIN_EMAIL must be a valid email address");
}
if (password.length < 12) {
  throw new Error("ADMIN_PASSWORD must contain at least 12 characters");
}

async function hashPassword(value) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = await scryptAsync(value, salt, 64);
  return `scrypt:${salt}:${derivedKey.toString("hex")}`;
}

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();
await client.query(
  `INSERT INTO users (email, name, password_hash, role)
   VALUES ($1, $2, $3, 'MANAGER')
   ON CONFLICT (email) DO UPDATE SET
    name = EXCLUDED.name,
    password_hash = EXCLUDED.password_hash,
    role = 'MANAGER'`,
  [email, name, await hashPassword(password)]
);
await client.end();

console.log(`Manager account is ready for ${email}.`);
