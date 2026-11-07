import { Inject, Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { ICatalogResponse, IQuote } from "../shared/types/index.js";
import type {
  ICustomerOrderInput,
  ICustomerOrderUpdate,
} from "../shared/types/customer-order.js";
import {
  calculateQuote,
  parseOrderInput,
  pickupDates,
} from "../shared/rules.js";
import { InputError } from "../shared/utils/input-error.js";
import { onlyKeys, record } from "../shared/utils/validation.js";
import { CONFIGURATION } from "./configuration.js";
import { Database } from "./database.js";
import { OrdersRepository } from "./orders.repository.js";
import type { IAppConfiguration } from "./types/configuration.js";
import type { IOrderSnapshot, IPointRow } from "./types/orders.js";

function parseOrder(value: unknown): ICustomerOrderInput {
  const body = record(value);
  const { pointId, returnSlot, ...fields } = body;
  if (typeof pointId !== "string" || !/^[a-z0-9-]{1,60}$/.test(pointId)) {
    throw new InputError("Выберите химчистку.", "pointId");
  }
  const slot = record(returnSlot, "returnDate");
  onlyKeys(slot, ["date", "slotId"], "returnDate");
  if (typeof slot.date !== "string" || typeof slot.slotId !== "string") {
    throw new InputError("Выберите дату и интервал возврата.", "returnDate");
  }
  return {
    ...parseOrderInput(fields),
    pointId,
    returnSlot: { date: slot.date, slotId: slot.slotId },
  };
}

function parseUpdate(value: unknown): ICustomerOrderUpdate {
  const body = record(value);
  onlyKeys(body, ["order", "version", "expectedTotalKopecks"], "request");
  const { version, expectedTotalKopecks } = body;
  if (
    typeof version !== "number" ||
    !Number.isSafeInteger(version) ||
    version < 1
  ) {
    throw new InputError("Обновите карточку заказа.", "version", 409);
  }
  if (
    typeof expectedTotalKopecks !== "number" ||
    !Number.isSafeInteger(expectedTotalKopecks) ||
    expectedTotalKopecks < 0
  ) {
    throw new InputError("Подтвердите итоговую сумму.", "total", 409);
  }
  return { order: parseOrder(body.order), version, expectedTotalKopecks };
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

@Injectable()
export class OrdersService {
  constructor(
    @Inject(CONFIGURATION) private readonly config: IAppConfiguration,
    @Inject(Database) private readonly database: Database,
    @Inject(OrdersRepository) private readonly repository: OrdersRepository,
  ) {}

  async getCatalog(): Promise<ICatalogResponse> {
    const points = await this.repository.points();
    const days = Math.max(1, ...points.map((point) => point.minimumReturnDays));
    const now = this.config.clock();
    return {
      catalog: this.config.catalog,
      pickupDates: pickupDates(this.config.catalog, now),
      returnDates: this.returnDates(days, now),
      points,
    };
  }

  private returnDates(days: number, now: Date): string[] {
    const catalog = this.config.catalog;
    return pickupDates(
      {
        ...catalog,
        pickup: {
          ...catalog.pickup,
          daysAhead: catalog.pickup.daysAhead + days,
        },
      },
      now,
    );
  }

  quote(body: unknown): IQuote {
    const value = record(body);
    onlyKeys(value, ["items"], "request");
    return calculateQuote(value.items, this.config.catalog);
  }

  private snapshot(
    order: ICustomerOrderInput,
    point: IPointRow,
    previous?: IOrderSnapshot,
  ): IOrderSnapshot {
    const catalog = this.config.catalog;
    const sameItems =
      previous?.order.items.length === order.items.length &&
      order.items.every((item) =>
        previous.order.items.some(
          (original) =>
            original.serviceId === item.serviceId &&
            original.quantity === item.quantity,
        ),
      ) &&
      new Set(order.items.map((item) => item.serviceId)).size ===
        order.items.length;
    if (!sameItems && order.catalogVersion !== catalog.version) {
      throw new InputError(
        "Тарифы обновились. Проверьте сумму заказа.",
        "catalogVersion",
        409,
      );
    }
    const quote =
      sameItems && previous
        ? previous.quote
        : calculateQuote(order.items, catalog);
    const now = this.config.clock();
    const pickup = this.bookedSlot(
      order.pickup,
      pickupDates(catalog, now),
      "date",
      "slotId",
      previous?.pickup,
    );
    const returnSlot = this.bookedSlot(
      order.returnSlot,
      this.returnDates(point.minimum_return_days, now),
      "returnDate",
      "returnSlotId",
      previous?.returnSlot,
    );
    if (
      (pickup !== previous?.pickup || returnSlot !== previous?.returnSlot) &&
      returnSlot.date < addDays(pickup.date, point.minimum_return_days)
    ) {
      throw new InputError(
        "Выберите дату возврата с учётом срока чистки.",
        "returnDate",
      );
    }
    return {
      order: { ...order, catalogVersion: quote.catalogVersion },
      quote,
      pickup,
      returnSlot,
    };
  }

  private bookedSlot(
    slot: ICustomerOrderInput["pickup"],
    dates: string[],
    dateField: string,
    slotField: string,
    previous?: IOrderSnapshot["pickup"],
  ) {
    if (previous?.date === slot.date && previous.slotId === slot.slotId) {
      return previous;
    }
    const rules = this.config.catalog.pickup;
    if (!dates.includes(slot.date)) {
      throw new InputError("Выберите доступную дату.", dateField);
    }
    const match = rules.slots.find((item) => item.id === slot.slotId);
    if (!match) {
      throw new InputError("Выберите доступный интервал.", slotField);
    }
    return { ...slot, slotLabel: match.label, timeZone: rules.timeZone };
  }

  create(accountId: string, body: unknown, requestKey: string | undefined) {
    if (
      !requestKey ||
      !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(requestKey)
    ) {
      throw new InputError(
        "Укажите ключ повторной отправки в формате UUID.",
        "requestKey",
      );
    }
    const key = requestKey.toLowerCase();
    const input = parseOrder(body);
    const hash = createHash("sha256")
      .update(JSON.stringify(input))
      .digest("hex");
    return this.database.transaction(async (client) => {
      const replay = await this.repository.replay(client, accountId, key, hash);
      if (replay) {
        return replay;
      }
      const point = await this.repository.lockPoint(client, input.pointId);
      const snapshot = this.snapshot(input, point);
      const id = await this.repository.insert(
        client,
        accountId,
        key,
        hash,
        snapshot,
      );
      await this.repository.saveBookings(client, point, id, snapshot);
      const order = await this.repository.get(accountId, id, client);
      await this.repository.event(client, order, accountId, "created");
      return order;
    });
  }

  list(accountId: string) {
    return this.repository.list(accountId);
  }

  get(accountId: string, id: number) {
    return this.repository.get(accountId, id);
  }

  update(accountId: string, id: number, body: unknown) {
    return this.database.transaction(async (client) => {
      const previous = await this.repository.get(accountId, id, client);
      const update = parseUpdate(body);
      if (previous.status !== "new" || previous.version !== update.version) {
        throw new InputError(
          previous.status === "new"
            ? "Заказ уже изменился. Обновите карточку."
            : "Курьер уже назначен. Для изменений свяжитесь с химчисткой.",
          "version",
          409,
        );
      }
      if (previous.point.id !== update.order.pointId) {
        throw new InputError(
          "Изменить химчистку в оформленном заказе нельзя.",
          "pointId",
        );
      }
      const point = await this.repository.lockPoint(client, previous.point.id);
      const snapshot = this.snapshot(update.order, point, previous);
      if (snapshot.quote.totalKopecks !== update.expectedTotalKopecks) {
        throw new InputError(
          "Сумма изменилась. Проверьте новый расчёт.",
          "total",
          409,
        );
      }
      await this.repository.saveBookings(client, point, id, snapshot, previous);
      await this.repository.update(client, id, snapshot);
      const order = await this.repository.get(accountId, id, client);
      await this.repository.event(client, order, accountId, "edited");
      return order;
    });
  }
}
