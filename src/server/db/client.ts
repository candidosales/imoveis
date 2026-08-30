import { Database, type SQLQueryBindings } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { SCHEMA_SQL } from "#/server/db/schema";

const DB_PATH = process.env.DATABASE_PATH ?? "./data/caucaia-imoveis.sqlite";

mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH, { create: true });
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");
db.exec(SCHEMA_SQL);

/**
 * bun-types' `Database.run()` signature only fits positional/array bindings;
 * it rejects the named-parameter object form the runtime actually supports.
 * This narrows the cast to one place instead of scattering `as unknown as`.
 */
export function runNamed(
	sql: string,
	params: Record<string, SQLQueryBindings>,
): void {
	db.run(sql, params as unknown as SQLQueryBindings[]);
}
