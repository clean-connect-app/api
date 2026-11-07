import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import { AuthService } from "./auth.service.js";
import { cookieValue, sessionCookie } from "./auth.controller.js";
import { CONFIGURATION } from "./configuration.js";
import { InputError } from "../shared/utils/input-error.js";
import type { IAppConfiguration } from "./types/configuration.js";
import { Database } from "./database.js";
import { OrdersService } from "./orders.service.js";

@Controller()
export class OrdersController {
  constructor(
    @Inject(OrdersService) private readonly orders: OrdersService,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(CONFIGURATION) private readonly config: IAppConfiguration,
    @Inject(Database) private readonly database: Database,
  ) {}

  private async account(request: Request): Promise<string> {
    const account = await this.auth.account(
      cookieValue(request, sessionCookie(this.config)),
    );
    if (!account) {
      throw new InputError("Войдите, чтобы работать с заказами.", "", 401);
    }
    return account;
  }

  private orderId(id: number): number {
    if (id < 1 || id > 2_147_483_647) {
      throw new InputError("Заказ не найден.", "", 404);
    }
    return id;
  }

  @Get("health")
  async health() {
    await this.database.pool.query("SELECT id FROM points LIMIT 1");
    return { status: "ok", service: "clean-connect" };
  }

  @Get("catalog")
  catalog() {
    return this.orders.getCatalog();
  }

  @Post("quote")
  @HttpCode(200)
  quote(@Body() body: unknown) {
    return this.orders.quote(body);
  }

  @Post("orders")
  async create(
    @Req() request: Request,
    @Body() body: unknown,
    @Headers("idempotency-key") requestKey?: string,
  ) {
    return this.orders.create(await this.account(request), body, requestKey);
  }

  @Get("me/orders")
  async list(@Req() request: Request) {
    return this.orders.list(await this.account(request));
  }

  @Get("me/orders/:id")
  async get(@Req() request: Request, @Param("id", ParseIntPipe) id: number) {
    return this.orders.get(await this.account(request), this.orderId(id));
  }

  @Patch("me/orders/:id")
  async update(
    @Req() request: Request,
    @Param("id", ParseIntPipe) id: number,
    @Body() body: unknown,
  ) {
    return this.orders.update(
      await this.account(request),
      this.orderId(id),
      body,
    );
  }
}
