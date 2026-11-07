import { Inject, Injectable } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import * as oidc from "openid-client";
import { InputError } from "../shared/utils/input-error.js";
import { CONFIGURATION } from "./configuration.js";
import { Database } from "./database.js";
import type { IAppConfiguration } from "./types/configuration.js";
import type {
  IAccountSessionRow,
  ILoginAttempt,
  ILoginResult,
} from "./types/auth.js";

export const SESSION_SECONDS = 12 * 60 * 60;
export const LOGIN_SECONDS = 10 * 60;

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

@Injectable()
export class AuthService {
  private discovery: Promise<oidc.Configuration> | undefined;

  constructor(
    @Inject(CONFIGURATION) private readonly config: IAppConfiguration,
    @Inject(Database) private readonly database: Database,
  ) {}

  get available(): boolean {
    return Boolean(this.config.oidc);
  }

  private provider(): Promise<oidc.Configuration> {
    const options = this.config.oidc;
    if (!options) {
      throw new InputError("Вход по email пока не настроен.", "", 503);
    }
    this.discovery ??= oidc
      .discovery(
        options.issuer,
        options.clientId,
        options.clientSecret,
        oidc.ClientSecretBasic(options.clientSecret),
      )
      .then((configuration) => {
        oidc.enableNonRepudiationChecks(configuration);
        return configuration;
      })
      .catch((error: unknown) => {
        this.discovery = undefined;
        throw error;
      });
    return this.discovery;
  }

  async begin(returnTo: string) {
    const provider = await this.provider();
    const verifier = oidc.randomPKCECodeVerifier();
    const state = oidc.randomState();
    const nonce = oidc.randomNonce();
    const url = oidc.buildAuthorizationUrl(provider, {
      redirect_uri: new URL("/api/auth/callback", this.config.appOrigin).href,
      scope: "openid email",
      code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
      code_challenge_method: "S256",
      state,
      nonce,
      ...(this.config.oidc?.connection
        ? { connection: this.config.oidc.connection }
        : {}),
    });
    await this.database.pool.query(
      `WITH attempts AS (DELETE FROM login_attempts WHERE expires_at <= now()),
            expired AS (DELETE FROM sessions WHERE expires_at <= now())
       INSERT INTO login_attempts (state_hash, verifier, nonce, return_to, expires_at)
       VALUES ($1, $2, $3, $4, now() + $5 * interval '1 second')`,
      [digest(state), verifier, nonce, returnTo, LOGIN_SECONDS],
    );
    return { url: url.href, state };
  }

  async finish(callback: URL, browserState: string): Promise<ILoginResult> {
    const state = callback.searchParams.get("state");
    if (!state || state !== browserState) {
      return { returnTo: "/orders?login=failed" };
    }
    const result = await this.database.pool.query<ILoginAttempt>(
      `DELETE FROM login_attempts WHERE state_hash = $1 AND expires_at > now()
       RETURNING verifier, nonce, return_to`,
      [digest(state)],
    );
    const attempt = result.rows[0];
    if (!attempt) {
      return { returnTo: "/orders?login=failed" };
    }
    const provider = await this.provider();
    const tokens = await oidc
      .authorizationCodeGrant(provider, callback, {
        pkceCodeVerifier: attempt.verifier,
        expectedState: state,
        expectedNonce: attempt.nonce,
        idTokenExpected: true,
      })
      .catch(() => null);
    const identity = tokens?.claims();
    if (
      !identity ||
      typeof identity.email !== "string" ||
      identity.email_verified !== true
    ) {
      return { returnTo: `${attempt.return_to}?login=failed` };
    }
    const token = randomBytes(32).toString("base64url");
    await this.database.pool.query(
      `WITH account AS (
         INSERT INTO accounts (issuer, subject) VALUES ($1, $2)
         ON CONFLICT (issuer, subject) DO UPDATE SET subject = EXCLUDED.subject
         RETURNING id
       )
       INSERT INTO sessions (token_hash, account_id, expires_at)
       SELECT $3, id, now() + $4 * interval '1 second' FROM account`,
      [identity.iss, identity.sub, digest(token), SESSION_SECONDS],
    );
    return { returnTo: attempt.return_to, token };
  }

  async account(token: string): Promise<string | null> {
    if (!/^[\w-]{43}$/.test(token)) {
      return null;
    }
    const result = await this.database.pool.query<IAccountSessionRow>(
      "SELECT account_id FROM sessions WHERE token_hash = $1 AND expires_at > now()",
      [digest(token)],
    );
    return result.rows[0]?.account_id ?? null;
  }

  async logout(token: string): Promise<void> {
    if (token) {
      await this.database.pool.query(
        "DELETE FROM sessions WHERE token_hash = $1",
        [digest(token)],
      );
    }
  }
}
