import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module.js";
import { loadConfiguration } from "./configuration.js";
import type { IAppOptions } from "./types/index.js";
import { InputErrorFilter } from "./input-error.filter.js";
import { protectHttp } from "./utils/http-security.js";

export async function createApp(
  options: IAppOptions = {},
): Promise<NestExpressApplication> {
  const configuration = loadConfiguration(options);
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule.register(configuration),
    {
      ...(options.logger === false ? { logger: false } : {}),
      abortOnError: false,
      bodyParser: false,
    },
  );
  try {
    app.disable("x-powered-by");
    app.use(protectHttp(configuration.appOrigin));
    app.useBodyParser("json", { limit: "16kb", inflate: false });
    app.setGlobalPrefix("api");
    app.useGlobalFilters(new InputErrorFilter());
    return app;
  } catch (error) {
    await app.close();
    throw error;
  }
}
