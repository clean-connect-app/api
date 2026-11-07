import type { IAppOptions, IAppConfiguration } from "./types/index.js";
import { resolve } from "node:path";

import { loadCatalog } from "./catalog.js";

export const CONFIGURATION = Symbol("CONFIGURATION");

export function loadConfiguration(options: IAppOptions): IAppConfiguration {
  const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("Укажите DATABASE_URL.");
  }
  const appOrigin = new URL(
    options.appOrigin ?? process.env.APP_ORIGIN ?? "http://127.0.0.1:5173",
  );
  const isLocal = ["127.0.0.1", "localhost"].includes(appOrigin.hostname);
  if (
    (appOrigin.protocol !== "https:" &&
      !(isLocal && appOrigin.protocol === "http:")) ||
    appOrigin.href !== `${appOrigin.origin}/`
  ) {
    throw new Error("APP_ORIGIN должен содержать только адрес веб-приложения.");
  }
  const { OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET, OIDC_CONNECTION } =
    process.env;
  const oidc =
    OIDC_ISSUER && OIDC_CLIENT_ID && OIDC_CLIENT_SECRET
      ? {
          issuer: new URL(OIDC_ISSUER),
          clientId: OIDC_CLIENT_ID,
          clientSecret: OIDC_CLIENT_SECRET,
          ...(OIDC_CONNECTION ? { connection: OIDC_CONNECTION } : {}),
        }
      : undefined;
  if (
    (OIDC_ISSUER || OIDC_CLIENT_ID || OIDC_CLIENT_SECRET || OIDC_CONNECTION) &&
    !oidc
  ) {
    throw new Error(
      "Укажите OIDC_ISSUER, OIDC_CLIENT_ID и OIDC_CLIENT_SECRET.",
    );
  }
  if (oidc && oidc.issuer.protocol !== "https:") {
    throw new Error("OIDC_ISSUER должен использовать HTTPS.");
  }
  return {
    catalog: loadCatalog(options.catalogPath ?? resolve("data/catalog.json")),
    databaseUrl,
    appOrigin,
    clock: options.clock ?? (() => new Date()),
    ...(oidc ? { oidc } : {}),
  };
}
