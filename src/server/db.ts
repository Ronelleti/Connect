import { getConnectionString } from "@netlify/database";
import pg from "pg";

const { Pool } = pg;

// Return DATE columns as their "YYYY-MM-DD" text. By default pg turns them into a Date at
// local midnight, which shifts every date back a day when the server's time zone is ahead
// of UTC (e.g. running locally in Israel).
const DATE_OID = 1082;
pg.types.setTypeParser(DATE_OID, (value: string) => value);

declare global {
  // Reuse the pool during Next.js hot reloads and warm function invocations.
  var wecomconnectPool: pg.Pool | undefined;
}

export function getPool() {
  if (!global.wecomconnectPool) {
    global.wecomconnectPool = new Pool({
      connectionString: resolveConnectionString()
    });
  }

  return global.wecomconnectPool;
}

export async function query<T>(sql: string, values: unknown[] = []): Promise<T[]> {
  const result = await getPool().query(sql, values);
  return result.rows as T[];
}

function resolveConnectionString(): string {
  const localConnectionString = process.env.DATABASE_URL?.trim();
  return localConnectionString || getConnectionString();
}
