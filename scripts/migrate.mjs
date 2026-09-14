import { readFile } from "node:fs/promises";
import process from "node:process";
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const sql = await readFile(new URL("../db/schema.sql", import.meta.url), "utf8");
const client = new pg.Client({ connectionString: databaseUrl });

await client.connect();
await client.query(sql);
await client.end();

console.log("Database schema is up to date.");
