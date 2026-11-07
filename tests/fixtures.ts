import { resolve } from "node:path";
import { loadCatalog } from "../src/server/catalog.js";
import type { IOrderInput } from "../src/shared/types/index.js";

export const catalog = loadCatalog(resolve("data/catalog.json"));
export const fixedNow = new Date("2026-11-04T20:30:00Z");

export function validOrder(): IOrderInput {
  return {
    catalogVersion: catalog.version,
    items: [
      { serviceId: "shirt", quantity: 2 },
      { serviceId: "trousers", quantity: 1 },
    ],
    customer: {
      name: "Тестовый клиент",
      phone: "+7 (999) 123-45-67",
      address: "Тестовая улица, дом 10, кв. 5",
    },
    pickup: { date: "2026-11-06", slotId: "morning" },
    note: "Тестовая заявка",
  };
}
