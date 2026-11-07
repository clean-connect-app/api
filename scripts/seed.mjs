import pg from "pg";

if (!process.env.DATABASE_URL || process.env.ENABLE_DEMO_SEED !== "true") {
  throw new Error(
    "Укажите DATABASE_URL и ENABLE_DEMO_SEED=true для демоданных.",
  );
}
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  await pool.query(`
    WITH demo (id, name) AS (
      VALUES ('demo-a', 'Чистка на Вайнера'), ('demo-b', 'Чистка на Малышева')
    ),
    inserted AS (
      INSERT INTO organizations (id, name)
      SELECT id, name FROM demo ON CONFLICT (id) DO NOTHING
    )
    INSERT INTO points (id, organization_id, name, phone, slot_capacity, minimum_return_days)
    SELECT id, id, name, '+79990000000', 4, 1 FROM demo
    ON CONFLICT (id) DO NOTHING
  `);
} finally {
  await pool.end();
}
