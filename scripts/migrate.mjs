import { readFile } from "node:fs/promises";
import process from "node:process";
import pg from "pg";

// Use the local .env when there is one (values already in the environment win).
try {
  process.loadEnvFile(".env");
} catch {
  // No .env file: rely on the environment.
}

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const sql = await readFile(new URL("../db/schema.sql", import.meta.url), "utf8");
const client = new pg.Client({ connectionString: databaseUrl });

await client.connect();

// A database made for the NOC app has a "users" table without teams. The Support & Sales
// schema can't be applied on top of it; it needs its own, empty database.
const { rows } = await client.query(
  `SELECT
     EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users') AS has_users,
     EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'team_id') AS has_teams`
);
if (rows[0].has_users && !rows[0].has_teams) {
  await client.end();
  console.error(
    [
      "This database belongs to the NOC app (WecomV3), not to Support & Sales.",
      "Create a separate, empty database for this app and point DATABASE_URL in .env at it, for example:",
      "  docker compose exec postgres createdb -U wecomconnect wecom_support",
      "  DATABASE_URL=postgres://wecomconnect:wecomconnect@localhost:5432/wecom_support",
      "then run `npm run db:migrate` and `npm run db:seed` again."
    ].join("\n")
  );
  process.exit(1);
}

await client.query(sql);
await client.end();

console.log("Database schema is up to date.");
