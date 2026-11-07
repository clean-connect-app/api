import {
  isNonEmptyString,
  isIntegerInRange,
} from "../shared/utils/validation.js";

import { readFileSync } from "node:fs";
import type { ICatalog } from "../shared/types/index.js";

/** Ошибка конфигурации останавливает запуск, вместо расчётов по повреждённым тарифам. */
export function loadCatalog(path: string): ICatalog {
  const data = JSON.parse(readFileSync(path, "utf8")) as ICatalog;
  const fail = (message: string): never => {
    throw new Error(`Ошибка каталога: ${message}`);
  };
  if (
    !data ||
    typeof data !== "object" ||
    !isNonEmptyString(data.version) ||
    data.currency !== "RUB" ||
    !isNonEmptyString(data.city) ||
    typeof data.demo !== "boolean"
  ) {
    fail("проверьте version, currency, city и demo.");
  }
  if (
    !Array.isArray(data.services) ||
    data.services.length < 1 ||
    data.services.length > 100
  ) {
    fail("нужны 1–100 услуг.");
  }
  const ids = new Set<string>();
  for (const service of data.services) {
    if (
      !service ||
      !isNonEmptyString(service.id) ||
      !/^[a-z][a-z0-9-]{0,39}$/.test(service.id) ||
      ids.has(service.id) ||
      !isNonEmptyString(service.name) ||
      !isNonEmptyString(service.description) ||
      !isNonEmptyString(service.category) ||
      !["shirt", "trousers", "dress", "suit", "coat", "duvet"].includes(
        service.icon,
      ) ||
      !isIntegerInRange(service.priceKopecks, 1, 100_000_000)
    ) {
      fail("проверьте поля услуги, уникальность id и цену в копейках.");
    }
    ids.add(service.id);
  }
  if (
    !data.delivery ||
    !isIntegerInRange(data.delivery.feeKopecks, 0, 100_000_000) ||
    !isIntegerInRange(data.delivery.freeFromKopecks, 1, 100_000_000)
  ) {
    fail("неверные правила доставки.");
  }
  if (
    !data.limits ||
    !isIntegerInRange(data.limits.maxQuantityPerService, 1, 100) ||
    !isIntegerInRange(data.limits.maxItems, 1, 1000)
  ) {
    fail("неверные ограничения количества.");
  }
  if (
    !data.pickup ||
    !isIntegerInRange(data.pickup.daysAhead, 1, 60) ||
    !isNonEmptyString(data.pickup.timeZone) ||
    !Array.isArray(data.pickup.slots) ||
    data.pickup.slots.length === 0 ||
    data.pickup.slots.length > 24
  ) {
    fail("неверные настройки забора.");
  }
  try {
    new Intl.DateTimeFormat("ru", { timeZone: data.pickup.timeZone }).format();
  } catch {
    fail("неизвестный часовой пояс.");
  }
  const slotIds = new Set<string>();
  for (const slot of data.pickup.slots) {
    if (
      !slot ||
      !isNonEmptyString(slot.id) ||
      !isNonEmptyString(slot.label) ||
      slotIds.has(slot.id)
    ) {
      fail("интервалы должны иметь уникальные id и подписи.");
    }
    slotIds.add(slot.id);
  }
  return data;
}
