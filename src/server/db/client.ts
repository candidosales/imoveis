import { Database, type SQLQueryBindings } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { SCHEMA_SQL } from "#/server/db/schema";

const DB_PATH = process.env.DATABASE_PATH ?? "./data/caucaia-imoveis.sqlite";

mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH, { create: true });
db.run("PRAGMA journal_mode = WAL;");
db.run("PRAGMA foreign_keys = ON;");
db.run(SCHEMA_SQL);

// `CREATE TABLE IF NOT EXISTS` above doesn't alter an already-existing table,
// so new columns need an explicit guarded migration.
const listingColumns = db.query("PRAGMA table_info(listings)").all() as {
	name: string;
}[];
if (!listingColumns.some((c) => c.name === "favorite")) {
	db.run(
		"ALTER TABLE listings ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0;",
	);
}

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
