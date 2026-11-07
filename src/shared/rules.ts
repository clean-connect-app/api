import { InputError } from "./utils/input-error.js";
import { record, onlyKeys, text } from "./utils/validation.js";

import type {
  IBasketItem,
  ICatalog,
  IOrderInput,
  IQuote,
} from "./types/index.js";

export function calculateQuote(value: unknown, catalog: ICatalog): IQuote {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > catalog.services.length
  ) {
    throw new InputError("Выберите хотя бы одну услугу.", "items");
  }
  const seen = new Set<string>();
  const lines = value.map((raw: unknown) => {
    const item = record(raw, "items");
    onlyKeys(item, ["serviceId", "quantity"], "items");
    const service = catalog.services.find(
      (candidate) => candidate.id === item.serviceId,
    );
    if (!service) {
      throw new InputError("Неизвестная услуга. Обновите каталог.", "items");
    }
    if (seen.has(service.id)) {
      throw new InputError("Услуга повторяется в заказе.", "items");
    }
    seen.add(service.id);
    if (
      typeof item.quantity !== "number" ||
      !Number.isInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > catalog.limits.maxQuantityPerService
    ) {
      throw new InputError(
        `Количество: целое число от 1 до ${catalog.limits.maxQuantityPerService}.`,
        "items",
      );
    }
    return {
      serviceId: service.id,
      name: service.name,
      quantity: item.quantity,
      priceKopecks: service.priceKopecks,
      amountKopecks: service.priceKopecks * item.quantity,
    };
  });
  const quantity = lines.reduce((sum, line) => sum + line.quantity, 0);
  if (quantity > catalog.limits.maxItems) {
    throw new InputError(
      `В одной заявке может быть до ${catalog.limits.maxItems} вещей.`,
      "items",
    );
  }
  const subtotalKopecks = lines.reduce(
    (sum, line) => sum + line.amountKopecks,
    0,
  );
  const deliveryKopecks =
    subtotalKopecks >= catalog.delivery.freeFromKopecks
      ? 0
      : catalog.delivery.feeKopecks;
  const totalKopecks = subtotalKopecks + deliveryKopecks;
  if (!Number.isSafeInteger(totalKopecks)) {
    throw new InputError("Сумма заказа слишком велика.", "items");
  }
  return {
    catalogVersion: catalog.version,
    currency: catalog.currency,
    lines,
    quantity,
    subtotalKopecks,
    deliveryKopecks,
    totalKopecks,
  };
}

/** Даты календаря химчистки: с завтрашнего дня, независимо от часового пояса браузера. */
export function pickupDates(catalog: ICatalog, now = new Date()): string[] {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: catalog.pickup.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) =>
    parts.find((value) => value.type === type)!.value;
  const today = Date.UTC(
    Number(part("year")),
    Number(part("month")) - 1,
    Number(part("day")),
  );
  return Array.from({ length: catalog.pickup.daysAhead }, (_, i) =>
    new Date(today + (i + 1) * 86_400_000).toISOString().slice(0, 10),
  );
}

/** Разбор формы не зависит от актуального каталога и календаря повторной отправки. */
export function parseOrderInput(value: unknown): IOrderInput {
  const body = record(value);
  onlyKeys(
    body,
    ["catalogVersion", "items", "customer", "pickup", "note"],
    "request",
  );
  if (typeof body.catalogVersion !== "string" || !body.catalogVersion) {
    throw new InputError(
      "Тарифы обновились. Обновите страницу и проверьте сумму заказа.",
      "catalogVersion",
      409,
    );
  }
  if (
    !Array.isArray(body.items) ||
    body.items.length === 0 ||
    body.items.length > 100
  ) {
    throw new InputError("Выберите хотя бы одну услугу.", "items");
  }
  const items = body.items.map((value: unknown): IBasketItem => {
    const item = record(value, "items");
    onlyKeys(item, ["serviceId", "quantity"], "items");
    if (typeof item.serviceId !== "string" || !item.serviceId) {
      throw new InputError("Неизвестная услуга. Обновите каталог.", "items");
    }
    if (
      typeof item.quantity !== "number" ||
      !Number.isSafeInteger(item.quantity) ||
      item.quantity < 1
    ) {
      throw new InputError(
        "Количество должно быть положительным целым числом.",
        "items",
      );
    }
    return { serviceId: item.serviceId, quantity: item.quantity };
  });
  const customer = record(body.customer, "customer");
  onlyKeys(customer, ["name", "phone", "address"], "customer");
  const name = text(
    customer.name,
    "name",
    2,
    80,
    "Введите имя от 2 до 80 символов.",
  );
  const phoneInput = text(
    customer.phone,
    "phone",
    10,
    30,
    "Введите российский номер телефона: +7 и 10 цифр.",
  );
  if (!/^[+\d\s()-]+$/.test(phoneInput)) {
    throw new InputError("Телефон содержит недопустимые символы.", "phone");
  }
  const digits = phoneInput.replace(/\D/g, "");
  if (!/^[78]\d{10}$/.test(digits)) {
    throw new InputError(
      "Введите российский номер телефона: +7 и 10 цифр.",
      "phone",
    );
  }
  const address = text(
    customer.address,
    "address",
    10,
    240,
    "Укажите адрес: улицу, дом и квартиру (10–240 символов).",
  );
  const pickup = record(body.pickup, "pickup");
  onlyKeys(pickup, ["date", "slotId"], "pickup");
  if (typeof pickup.date !== "string") {
    throw new InputError("Выберите доступную дату забора.", "date");
  }
  if (typeof pickup.slotId !== "string") {
    throw new InputError("Выберите доступный интервал забора.", "slotId");
  }
  const note =
    body.note === undefined
      ? ""
      : text(body.note, "note", 0, 500, "Комментарий: не больше 500 символов.");
  return {
    catalogVersion: body.catalogVersion,
    items,
    customer: { name, phone: "+7" + digits.slice(1), address },
    pickup: { date: pickup.date, slotId: pickup.slotId },
    note,
  };
}

export function validateOrder(
  value: unknown,
  catalog: ICatalog,
  now = new Date(),
): IOrderInput {
  const input = parseOrderInput(value);
  if (input.catalogVersion !== catalog.version) {
    throw new InputError(
      "Тарифы обновились. Обновите страницу и проверьте сумму заказа.",
      "catalogVersion",
      409,
    );
  }
  calculateQuote(input.items, catalog);
  if (!pickupDates(catalog, now).includes(input.pickup.date)) {
    throw new InputError(
      `Выберите дату забора с завтрашнего дня на ближайшие ${catalog.pickup.daysAhead} дней.`,
      "date",
    );
  }
  if (!catalog.pickup.slots.some((slot) => slot.id === input.pickup.slotId)) {
    throw new InputError("Выберите доступный интервал забора.", "slotId");
  }
  return input;
}
