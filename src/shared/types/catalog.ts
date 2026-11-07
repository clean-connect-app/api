import type { IPoint } from "./customer-order.js";

export type TServiceIcon =
  "shirt" | "trousers" | "dress" | "suit" | "coat" | "duvet";

export interface IService {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: TServiceIcon;
  priceKopecks: number;
}

export interface IDeliveryRules {
  feeKopecks: number;
  freeFromKopecks: number;
}

export interface ICatalogLimits {
  maxQuantityPerService: number;
  maxItems: number;
}

export interface IPickupSlot {
  id: string;
  label: string;
}

export interface IPickupRules {
  timeZone: string;
  daysAhead: number;
  slots: IPickupSlot[];
}

export interface ICatalog {
  version: string;
  currency: "RUB";
  city: string;
  demo: boolean;
  services: IService[];
  delivery: IDeliveryRules;
  limits: ICatalogLimits;
  pickup: IPickupRules;
}

export interface ICatalogResponse {
  catalog: ICatalog;
  pickupDates: string[];
  returnDates: string[];
  points: IPoint[];
}
