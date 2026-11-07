import type {
  IOrderInput,
  IPickupInput,
  IQuote,
  IReceiptPickup,
} from "./order.js";

export type TOrderStatus =
  "new" | "assigned" | "collected" | "ready" | "delivered";

export interface IPoint {
  id: string;
  name: string;
  phone: string;
  minimumReturnDays: number;
}

export interface ICustomerOrderInput extends IOrderInput {
  pointId: string;
  returnSlot: IPickupInput;
}

export interface ICustomerOrderUpdate {
  order: ICustomerOrderInput;
  version: number;
  expectedTotalKopecks: number;
}

export interface ICustomerOrder {
  id: number;
  number: string;
  version: number;
  status: TOrderStatus;
  statusLabel: string;
  createdAt: string;
  quote: IQuote;
  pickup: IReceiptPickup;
  returnSlot: IReceiptPickup;
  point: IPoint;
  order: ICustomerOrderInput;
}
