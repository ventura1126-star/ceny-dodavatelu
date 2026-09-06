import { createClient, type Client, type InValue, type Row } from "@libsql/client";
import { DDL } from "./ddl";

let client: Client | null = null;
let ready: Promise<void> | null = null;

function resolveUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (url) return url;
  // Výchozí lokální soubor — relativní cesta se vztahuje ke kořeni projektu.
  return "file:./data/ceny.db";
}

export function db(): Client {
  if (!client) {
    client = createClient({
      url: resolveUrl(),
      authToken: process.env.DATABASE_AUTH_TOKEN?.trim() || undefined,
    });
  }
  return client;
}

/** Vytvoří schéma, pokud ještě neexistuje. Spustí se nejvýš jednou za běh procesu. */
export function ensureSchema(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      const c = db();
      await c.execute("PRAGMA foreign_keys = ON");
      for (const statement of DDL) await c.execute(statement);
    })().catch((err) => {
      ready = null;
      throw err;
    });
  }
  return ready;
}

export type SqlParams = InValue[] | Record<string, InValue>;

/** Vrátí všechny řádky dotazu. */
export async function all<T = Row>(sql: string, args: SqlParams = []): Promise<T[]> {
  await ensureSchema();
  const res = await db().execute({ sql, args: args as never });
  return res.rows as unknown as T[];
}

/** Vrátí první řádek nebo null. */
export async function one<T = Row>(sql: string, args: SqlParams = []): Promise<T | null> {
  const rows = await all<T>(sql, args);
  return rows[0] ?? null;
}

/** Provede zápis a vrátí id vloženého řádku. */
export async function run(sql: string, args: SqlParams = []) {
  await ensureSchema();
  const res = await db().execute({ sql, args: args as never });
  return {
    lastInsertRowid: res.lastInsertRowid ? Number(res.lastInsertRowid) : null,
    rowsAffected: res.rowsAffected,
  };
}

/** Skupina zápisů v jedné transakci. */
export async function batch(statements: { sql: string; args?: SqlParams }[]) {
  await ensureSchema();
  return db().batch(
    statements.map((s) => ({ sql: s.sql, args: (s.args ?? []) as never })),
    "write",
  );
}
