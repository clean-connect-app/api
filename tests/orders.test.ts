import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { test } from "node:test";
import pg from "pg";
import { createApp } from "../src/server/app.js";
import type { IAccountIdRow } from "../src/server/types/auth.js";
import type {
  ICustomerOrder,
  ICustomerOrderInput,
} from "../src/shared/types/customer-order.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const origin = "http://127.0.0.1:5173";

void test(
  "клиентский API и брони в PostgreSQL",
  { skip: !databaseUrl },
  async (t) => {
    assert.ok(databaseUrl);
    const schema = `test_${randomBytes(8).toString("hex")}`;
    const admin = new pg.Pool({ connectionString: databaseUrl });
    t.after(async () => {
      try {
        await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      } finally {
        await admin.end();
      }
    });
    await admin.query(`CREATE SCHEMA "${schema}"`);
    const isolated = new URL(databaseUrl);
    isolated.searchParams.set("options", `-c search_path=${schema}`);
    const pool = new pg.Pool({ connectionString: isolated.href });
    t.after(() => pool.end());
    await pool.query(await readFile("migrations/001-initial.sql", "utf8"));
    await pool.query(`
    INSERT INTO organizations VALUES ('test-a', 'Тест A'), ('test-b', 'Тест Б');
    INSERT INTO points VALUES
      ('test-a', 'test-a', 'Точка A', '+79990000000', 1, 1),
      ('test-b', 'test-b', 'Точка Б', '+79990000000', 1, 1);
  `);

    async function session(subject: string) {
      const token = randomBytes(32).toString("base64url");
      const account = await pool.query<IAccountIdRow>(
        `INSERT INTO accounts (issuer, subject) VALUES ('https://test.invalid', $1)
       ON CONFLICT (issuer, subject) DO UPDATE SET subject = EXCLUDED.subject RETURNING id`,
        [subject],
      );
      await pool.query(
        "INSERT INTO sessions VALUES ($1, $2, now() + interval '1 hour')",
        [createHash("sha256").update(token).digest("hex"), account.rows[0]!.id],
      );
      return `clean-connect-session=${token}`;
    }

    const [alice, secondDevice, bob] = await Promise.all([
      session("alice"),
      session("alice"),
      session("bob"),
    ]);
    const app = await createApp({
      databaseUrl: isolated.href,
      appOrigin: origin,
      clock: () => new Date("2026-11-07T08:00:00Z"),
      logger: false,
    });
    t.after(() => app.close());
    await app.listen(0, "127.0.0.1");
    const endpoint = await app.getUrl();
    const order: ICustomerOrderInput = {
      catalogVersion: "demo-2026-01",
      pointId: "test-a",
      items: [{ serviceId: "shirt", quantity: 1 }],
      customer: {
        name: "Тестовый клиент",
        phone: "+79990000001",
        address: "Тестовый адрес, 1",
      },
      pickup: { date: "2026-11-08", slotId: "morning" },
      returnSlot: { date: "2026-11-09", slotId: "morning" },
      note: "",
    };

    function request(
      path: string,
      cookie?: string,
      options: RequestInit = {},
    ): Promise<Response> {
      return new Promise((resolve, reject) => {
        const connection = httpRequest(
          `${endpoint}/api/${path}`,
          {
            method: options.method ?? "GET",
            headers: {
              host: "127.0.0.1:5173",
              ...(cookie ? { cookie } : {}),
              ...Object.fromEntries(new Headers(options.headers)),
            },
          },
          (response) => {
            let body = "";
            response.setEncoding("utf8");
            response.on("data", (chunk: string) => {
              body += chunk;
            });
            response.on("error", reject);
            response.on("end", () =>
              resolve(
                new Response(body, { status: response.statusCode ?? 500 }),
              ),
            );
          },
        );
        connection.on("error", reject);
        connection.end(
          typeof options.body === "string" ? options.body : undefined,
        );
      });
    }

    function create(
      cookie: string,
      input: ICustomerOrderInput,
      key = randomUUID(),
    ) {
      return request("orders", cookie, {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/json",
          "idempotency-key": key,
        },
        body: JSON.stringify(input),
      });
    }

    function edit(
      order: ICustomerOrder,
      input: ICustomerOrderInput,
      cookie = alice,
      expected = order.quote.totalKopecks,
    ) {
      return request(`me/orders/${order.id}`, cookie, {
        method: "PATCH",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify({
          order: input,
          version: order.version,
          expectedTotalKopecks: expected,
        }),
      });
    }

    assert.equal((await request("me/orders")).status, 401);
    const crossOrigin = await request("orders", alice, {
      method: "POST",
      headers: {
        origin: "https://test.invalid",
        "content-type": "application/json",
      },
      body: "{}",
    });
    assert.equal(crossOrigin.status, 403);
    const noOrigin = await request("auth/logout", alice, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(noOrigin.status, 403);

    const key = randomUUID();
    const [first, duplicate] = await Promise.all([
      create(alice, order, key),
      create(alice, order, key),
    ]);
    assert.equal(first.status, 201, await first.clone().text());
    assert.equal(duplicate.status, 201, await duplicate.clone().text());
    const saved = (await first.json()) as ICustomerOrder;
    assert.deepEqual(await duplicate.json(), saved);
    assert.equal(
      (await create(alice, { ...order, note: "Другой запрос" }, key)).status,
      409,
    );
    assert.deepEqual(await (await request("me/orders", secondDevice)).json(), [
      saved,
    ]);
    assert.equal((await request(`me/orders/${saved.id}`, bob)).status, 404);
    assert.equal((await edit(saved, order, bob)).status, 404);

    const anotherPoint = await create(bob, { ...order, pointId: "test-b" });
    assert.equal(anotherPoint.status, 201, await anotherPoint.clone().text());
    const otherSlots = {
      ...order,
      pickup: { ...order.pickup, slotId: "evening" },
      returnSlot: { ...order.returnSlot, slotId: "evening" },
    };
    const contenders = await Promise.all([
      create(alice, otherSlots),
      create(bob, otherSlots),
    ]);
    assert.deepEqual(contenders.map(({ status }) => status).sort(), [201, 409]);
    assert.equal(
      (
        await edit(saved, {
          ...order,
          pickup: { ...order.pickup, slotId: "late" },
          returnSlot: otherSlots.returnSlot,
        })
      ).status,
      409,
    );
    assert.deepEqual(
      await (await request(`me/orders/${saved.id}`, alice)).json(),
      saved,
    );
    const bookings = await pool.query(
      "SELECT kind, slot_id FROM bookings WHERE order_id = $1 ORDER BY kind",
      [saved.id],
    );
    assert.deepEqual(bookings.rows, [
      { kind: "pickup", slot_id: "morning" },
      { kind: "return", slot_id: "morning" },
    ]);

    const changed = {
      ...order,
      items: [{ serviceId: "shirt", quantity: 2 }],
      returnSlot: { ...order.returnSlot, slotId: "late" },
    };
    assert.equal((await edit(saved, changed)).status, 409);
    const edited = await edit(
      saved,
      changed,
      alice,
      saved.quote.totalKopecks + 39_000,
    );
    assert.equal(edited.status, 200, await edited.clone().text());
    const current = (await edited.json()) as ICustomerOrder;
    assert.equal(current.version, 2);
    assert.equal(current.returnSlot.slotId, "late");
    assert.equal((await edit(saved, order)).status, 409);
    const events = await pool.query(
      "SELECT type FROM order_events WHERE order_id = $1 ORDER BY id",
      [saved.id],
    );
    assert.deepEqual(events.rows, [{ type: "created" }, { type: "edited" }]);
    await pool.query(
      "UPDATE orders SET status = 'assigned', version = version + 1 WHERE id = $1",
      [saved.id],
    );
    const denied = await edit(
      { ...current, version: 3 },
      changed,
      alice,
      current.quote.totalKopecks,
    );
    assert.equal(denied.status, 409);
    assert.match(await denied.text(), /Курьер уже назначен/);

    const signOut = await request("auth/logout", secondDevice, {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(signOut.status, 200);
    assert.equal((await request("me/orders", secondDevice)).status, 401);
    assert.equal((await request("me/orders", alice)).status, 200);
  },
);
