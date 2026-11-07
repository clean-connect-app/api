export interface IBasketItem {
  serviceId: string;
  quantity: number;
}

export interface IQuoteLine extends IBasketItem {
  name: string;
  priceKopecks: number;
  amountKopecks: number;
}

export interface IQuote {
  catalogVersion: string;
  currency: "RUB";
  lines: IQuoteLine[];
  quantity: number;
  subtotalKopecks: number;
  deliveryKopecks: number;
  totalKopecks: number;
}

export interface ICustomer {
  name: string;
  phone: string;
  address: string;
}

export interface IPickupInput {
  date: string;
  slotId: string;
}

export interface IOrderInput {
  catalogVersion: string;
  items: IBasketItem[];
  customer: ICustomer;
  pickup: IPickupInput;
  note: string;
}

export interface IReceiptPickup extends IPickupInput {
  slotLabel: string;
  timeZone: string;
}

export interface IReceipt {
  number: string;
  status: "new";
  statusLabel: "Новый";
  createdAt: string;
  quote: IQuote;
  pickup: IReceiptPickup;
}
