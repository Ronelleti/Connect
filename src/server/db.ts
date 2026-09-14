import { getConnectionString } from "@netlify/database";
import pg from "pg";

const { Pool } = pg;

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
