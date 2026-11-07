import type { OnApplicationShutdown } from "@nestjs/common";
import pg from "pg";
import type { PoolClient } from "pg";

export class Database implements OnApplicationShutdown {
  readonly pool: pg.Pool;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({
      connectionString,
      connectionTimeoutMillis: 5_000,
    });
  }

  async transaction<T>(
    execute: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    let discard = false;
    try {
      await client.query("BEGIN");
      const result = await execute(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        discard = true;
      }
      throw error;
    } finally {
      client.release(discard);
    }
  }

  async onApplicationShutdown() {
    await this.pool.end();
  }
}
