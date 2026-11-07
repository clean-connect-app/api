import { Inject, Injectable } from "@nestjs/common";
import type { PoolClient } from "pg";
import { Database } from "./database.js";
import { InputError } from "../shared/utils/input-error.js";
import type {
  ICustomerOrder,
  IPoint,
  TOrderStatus,
} from "../shared/types/customer-order.js";
import type {
  IBookingCapacityRow,
  IOrderIdRow,
  IOrderSnapshot,
  IPointRow,
  ISavedOrder,
} from "./types/orders.js";

const ORDER = `
  SELECT o.*, p.name AS point_name, p.phone, p.minimum_return_days
  FROM orders o JOIN points p ON p.id = o.point_id
`;
const STATUS: Record<TOrderStatus, string> = {
  new: "Новый",
  assigned: "Курьер назначен",
  collected: "Вещи забраны",
  ready: "Готов к возврату",
  delivered: "Доставлен",
};

function toCustomerOrder(row: ISavedOrder): ICustomerOrder {
  return {
    id: row.id,
    number: `CC-${String(row.id).padStart(6, "0")}`,
    version: row.version,
    status: row.status,
    statusLabel: STATUS[row.status],
    createdAt: row.created_at.toISOString(),
    ...row.snapshot,
    point: {
      id: row.point_id,
      name: row.point_name,
      phone: row.phone,
      minimumReturnDays: row.minimum_return_days,
    },
  };
}

@Injectable()
export class OrdersRepository {
  constructor(@Inject(Database) private readonly database: Database) {}

  async points(): Promise<IPoint[]> {
    const result = await this.database.pool.query<IPointRow>(
      "SELECT id, name, phone, minimum_return_days FROM points ORDER BY name, id",
    );
    return result.rows.map((point) => ({
      id: point.id,
      name: point.name,
      phone: point.phone,
      minimumReturnDays: point.minimum_return_days,
    }));
  }

  async list(accountId: string) {
    const result = await this.database.pool.query<ISavedOrder>(
      `${ORDER} WHERE o.account_id = $1 ORDER BY o.id DESC`,
      [accountId],
    );
    return result.rows.map(toCustomerOrder);
  }

  async get(accountId: string, id: number, client?: PoolClient) {
    const result = await (client ?? this.database.pool).query<ISavedOrder>(
      `${ORDER} WHERE o.account_id = $1 AND o.id = $2 ${client ? "FOR UPDATE OF o" : ""}`,
      [accountId, id],
    );
    const order = result.rows[0];
    if (!order) {
      throw new InputError("Заказ не найден.", "", 404);
    }
    return toCustomerOrder(order);
  }

  async replay(
    client: PoolClient,
    accountId: string,
    key: string,
    hash: string,
  ) {
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [`${accountId}:${key}`],
    );
    const result = await client.query<ISavedOrder>(
      `${ORDER} WHERE o.account_id = $1 AND o.request_key = $2`,
      [accountId, key],
    );
    const previous = result.rows[0];
    if (previous && previous.request_hash !== hash) {
      throw new InputError(
        "Ключ повторной отправки уже использован для другого заказа.",
        "requestKey",
        409,
      );
    }
    return previous ? toCustomerOrder(previous) : null;
  }

  async lockPoint(client: PoolClient, id: string): Promise<IPointRow> {
    // Блокировка сериализует изменения броней одной точки.
    const result = await client.query<IPointRow>(
      "SELECT * FROM points WHERE id = $1 FOR NO KEY UPDATE",
      [id],
    );
    const point = result.rows[0];
    if (!point) {
      throw new InputError("Выберите химчистку.", "pointId");
    }
    return point;
  }

  async saveBookings(
    client: PoolClient,
    point: IPointRow,
    id: number,
    snapshot: IOrderSnapshot,
    previous?: IOrderSnapshot,
  ) {
    for (const [kind, slot] of [
      ["pickup", snapshot.pickup],
      ["return", snapshot.returnSlot],
    ] as const) {
      if (
        slot === (kind === "pickup" ? previous?.pickup : previous?.returnSlot)
      ) {
        continue;
      }
      const capacity = await client.query<IBookingCapacityRow>(
        `SELECT count(*) >= $6 AS full FROM bookings
         WHERE point_id = $1 AND kind = $2 AND day = $3 AND slot_id = $4 AND order_id <> $5`,
        [point.id, kind, slot.date, slot.slotId, id, point.slot_capacity],
      );
      if (capacity.rows[0]?.full) {
        throw new InputError(
          kind === "pickup"
            ? "Интервал забора занят. Выберите другой."
            : "Интервал возврата занят. Выберите другой.",
          kind === "pickup" ? "slotId" : "returnSlotId",
          409,
        );
      }
      await client.query(
        `INSERT INTO bookings (order_id, point_id, kind, day, slot_id)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (order_id, kind) DO UPDATE SET day = EXCLUDED.day, slot_id = EXCLUDED.slot_id`,
        [id, point.id, kind, slot.date, slot.slotId],
      );
    }
  }

  async insert(
    client: PoolClient,
    accountId: string,
    key: string,
    hash: string,
    snapshot: IOrderSnapshot,
  ) {
    const result = await client.query<IOrderIdRow>(
      `INSERT INTO orders (account_id, point_id, request_key, request_hash, snapshot)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [accountId, snapshot.order.pointId, key, hash, snapshot],
    );
    return result.rows[0]!.id;
  }

  async update(client: PoolClient, id: number, snapshot: IOrderSnapshot) {
    await client.query(
      "UPDATE orders SET snapshot = $2, version = version + 1 WHERE id = $1",
      [id, snapshot],
    );
  }

  async event(
    client: PoolClient,
    order: ICustomerOrder,
    accountId: string,
    type: string,
  ) {
    await client.query(
      `INSERT INTO order_events (order_id, actor_id, actor_role, type, order_version)
       VALUES ($1, $2, 'customer', $3, $4)`,
      [order.id, accountId, type, order.version],
    );
  }
}
