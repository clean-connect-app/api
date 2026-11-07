import type { ICatalog } from "../../shared/types/index.js";

export interface IAppOptions {
  catalogPath?: string;
  databaseUrl?: string;
  appOrigin?: string;
  clock?: () => Date;
  logger?: false;
}

export interface IAppConfiguration {
  catalog: ICatalog;
  databaseUrl: string;
  appOrigin: URL;
  clock: () => Date;
  oidc?: IOidcOptions;
}

export interface IOidcOptions {
  issuer: URL;
  clientId: string;
  clientSecret: string;
  connection?: string;
}
