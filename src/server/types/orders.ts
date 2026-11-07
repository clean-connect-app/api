import type {
  ICustomerOrderInput,
  TOrderStatus,
} from "../../shared/types/customer-order.js";
import type { IQuote, IReceiptPickup } from "../../shared/types/order.js";

export interface IOrderSnapshot {
  order: ICustomerOrderInput;
  quote: IQuote;
  pickup: IReceiptPickup;
  returnSlot: IReceiptPickup;
}

export interface ISavedOrder {
  id: number;
  version: number;
  status: TOrderStatus;
  created_at: Date;
  point_id: string;
  snapshot: IOrderSnapshot;
  request_hash: string;
  point_name: string;
  phone: string;
  minimum_return_days: number;
}

export interface IPointRow {
  id: string;
  name: string;
  phone: string;
  slot_capacity: number;
  minimum_return_days: number;
}

export interface IBookingCapacityRow {
  full: boolean;
}

export interface IOrderIdRow {
  id: number;
}
