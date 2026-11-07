import { Module } from "@nestjs/common";
import type { DynamicModule } from "@nestjs/common";
import type { IAppConfiguration } from "./types/index.js";
import { CONFIGURATION } from "./configuration.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { Database } from "./database.js";
import { OrdersController } from "./orders.controller.js";
import { OrdersRepository } from "./orders.repository.js";
import { OrdersService } from "./orders.service.js";

@Module({})
export class AppModule {
  static register(configuration: IAppConfiguration): DynamicModule {
    return {
      module: AppModule,
      controllers: [AuthController, OrdersController],
      providers: [
        { provide: CONFIGURATION, useValue: configuration },
        {
          provide: Database,
          useFactory: () => new Database(configuration.databaseUrl),
        },
        AuthService,
        OrdersRepository,
        OrdersService,
      ],
    };
  }
}
