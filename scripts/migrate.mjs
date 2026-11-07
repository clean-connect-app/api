import { readdir, readFile } from "node:fs/promises";
import pg from "pg";

if (!process.env.DATABASE_URL) {
  throw new Error("Укажите DATABASE_URL.");
}
const directory = new URL("../migrations/", import.meta.url);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(12891)");
    await client.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY)",
    );
    for (const name of (await readdir(directory)).sort()) {
      if (!name.endsWith(".sql")) {
        continue;
      }
      const applied = await client.query(
        "SELECT name FROM schema_migrations WHERE name = $1",
        [name],
      );
      if (applied.rowCount === 0) {
        await client.query(await readFile(new URL(name, directory), "utf8"));
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [
          name,
        ]);
        console.log(`Применена миграция ${name}`);
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
