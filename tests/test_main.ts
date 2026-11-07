import { InputError } from "../src/shared/utils/input-error.js";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  calculateQuote,
  pickupDates,
  validateOrder,
} from "../src/shared/rules.js";
import { loadCatalog } from "../src/server/catalog.js";
import { catalog, fixedNow, validOrder } from "./fixtures.js";

void describe("Расчёт стоимости", () => {
  void it("считает услуги и доставку в целых копейках", () => {
    const quote = calculateQuote(validOrder().items, catalog);
    assert.equal(quote.quantity, 3);
    assert.equal(quote.subtotalKopecks, 143000);
    assert.equal(quote.deliveryKopecks, 39900);
    assert.equal(quote.totalKopecks, 182900);
  });

  void it("делает доставку бесплатной ровно на пороге и выше него", () => {
    const copy = structuredClone(catalog);
    const shirt = copy.services.find((service) => service.id === "shirt");
    assert.ok(shirt);
    shirt.priceKopecks = 299999;
    assert.equal(
      calculateQuote([{ serviceId: "shirt", quantity: 1 }], copy)
        .deliveryKopecks,
      39900,
    );
    shirt.priceKopecks = 300000;
    assert.equal(
      calculateQuote([{ serviceId: "shirt", quantity: 1 }], copy)
        .deliveryKopecks,
      0,
    );
    shirt.priceKopecks = 300001;
    assert.equal(
      calculateQuote([{ serviceId: "shirt", quantity: 1 }], copy)
        .deliveryKopecks,
      0,
    );
  });

  for (const [label, items] of [
    ["пустая корзина", []],
    ["не массив", null],
    ["неизвестная услуга", [{ serviceId: "missing", quantity: 1 }]],
    [
      "повтор услуги",
      [
        { serviceId: "shirt", quantity: 1 },
        { serviceId: "shirt", quantity: 2 },
      ],
    ],
    ["подмена цены", [{ serviceId: "shirt", quantity: 1, priceKopecks: 1 }]],
  ] as const) {
    void it(`отклоняет ошибочный ввод - ${label}`, () => {
      assert.throws(() => calculateQuote(items, catalog), InputError);
    });
  }

  for (const quantity of [
    0,
    -1,
    1.5,
    21,
    "2",
    null,
    undefined,
    NaN,
    Infinity,
    true,
  ]) {
    void it(`отклоняет количество ${String(quantity)}`, () => {
      assert.throws(
        () => calculateQuote([{ serviceId: "shirt", quantity }], catalog),
        InputError,
      );
    });
  }

  void it("принимает граничное количество и ограничивает общий размер заказа", () => {
    assert.equal(
      calculateQuote([{ serviceId: "shirt", quantity: 20 }], catalog).quantity,
      20,
    );
    const copy = structuredClone(catalog);
    copy.limits.maxItems = 2;
    assert.throws(() => calculateQuote(validOrder().items, copy), /до 2 вещей/);
  });
});

void describe("Оформление и календарь", () => {
  void it("нормализует телефон и пробелы в контактах", () => {
    const order = validOrder();
    order.customer.name = "  Тестовый клиент  ";
    const result = validateOrder(order, catalog, fixedNow);
    assert.equal(result.customer.name, "Тестовый клиент");
    assert.equal(result.customer.phone, "+79991234567");
    order.customer.phone = "8 (999) 123-45-67";
    assert.equal(
      validateOrder(order, catalog, fixedNow).customer.phone,
      "+79991234567",
    );
  });

  void it("строит календарь по часовому поясу химчистки через границу суток", () => {
    const dates = pickupDates(catalog, fixedNow);
    assert.equal(dates.length, 14);
    assert.equal(dates[0], "2026-11-06");
    assert.equal(dates.at(-1), "2026-11-19");
  });

  void it("правильно переходит на следующий год", () => {
    assert.equal(
      pickupDates(catalog, new Date("2026-12-31T10:00:00Z"))[0],
      "2027-01-01",
    );
  });

  for (const date of [
    "2026-11-04",
    "2026-11-05",
    "2026-11-20",
    "2026-02-30",
    "завтра",
  ]) {
    void it(`отклоняет недоступную дату ${date}`, () => {
      const order = validOrder();
      order.pickup.date = date;
      assert.throws(
        () => validateOrder(order, catalog, fixedNow),
        (error: unknown) =>
          error instanceof InputError && error.field === "date",
      );
    });
  }

  void it("принимает последний доступный день", () => {
    const order = validOrder();
    order.pickup.date = "2026-11-19";
    assert.equal(
      validateOrder(order, catalog, fixedNow).pickup.date,
      "2026-11-19",
    );
  });

  for (const [field, value] of [
    ["name", " "],
    ["phone", "123"],
    ["phone", "+7abc9991234567"],
    ["address", "дом"],
  ] as const) {
    void it(`проверяет поле ${field} со значением ${JSON.stringify(value)}`, () => {
      const order = validOrder();
      order.customer[field] = value;
      assert.throws(
        () => validateOrder(order, catalog, fixedNow),
        (error: unknown) =>
          error instanceof InputError && error.field === field,
      );
    });
  }

  void it("отклоняет неизвестный интервал и слишком длинный комментарий", () => {
    const order = validOrder();
    order.pickup.slotId = "night";
    assert.throws(() => validateOrder(order, catalog, fixedNow), /интервал/);
    order.pickup.slotId = "morning";
    order.note = "а".repeat(501);
    assert.throws(() => validateOrder(order, catalog, fixedNow), /500/);
  });

  void it("возвращает конфликт при устаревших тарифах", () => {
    const order = validOrder();
    order.catalogVersion = "old";
    assert.throws(
      () => validateOrder(order, catalog, fixedNow),
      (error: unknown) =>
        error instanceof InputError && error.statusCode === 409,
    );
  });

  void it("отклоняет сумму, переданную клиентом", () => {
    assert.throws(
      () =>
        validateOrder({ ...validOrder(), totalKopecks: 1 }, catalog, fixedNow),
      /неизвестные поля/,
    );
  });
});

void describe("Обновление каталога", () => {
  void it("читает новые цены и отвергает повреждённую конфигурацию", () => {
    const directory = mkdtempSync(join(tmpdir(), "clean-connect-catalog-"));
    const path = join(directory, "catalog.json");
    try {
      const updated = structuredClone(catalog);
      updated.version = "demo-next";
      const shirt = updated.services.find((service) => service.id === "shirt");
      const trousers = updated.services.find(
        (service) => service.id === "trousers",
      );
      assert.ok(shirt);
      assert.ok(trousers);
      shirt.priceKopecks = 45000;
      writeFileSync(path, JSON.stringify(updated));
      assert.equal(
        loadCatalog(path).services.find((service) => service.id === "shirt")
          ?.priceKopecks,
        45000,
      );
      shirt.priceKopecks = -1;
      writeFileSync(path, JSON.stringify(updated));
      assert.throws(() => loadCatalog(path), /Ошибка каталога/);
      shirt.priceKopecks = 45000;
      trousers.id = shirt.id;
      writeFileSync(path, JSON.stringify(updated));
      assert.throws(() => loadCatalog(path), /уникальность/);
      writeFileSync(path, "{broken");
      assert.throws(() => loadCatalog(path), SyntaxError);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
