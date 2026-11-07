import {
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import type { CookieOptions, Request, Response } from "express";
import { AuthService, LOGIN_SECONDS, SESSION_SECONDS } from "./auth.service.js";
import { CONFIGURATION } from "./configuration.js";
import type { IAppConfiguration } from "./types/configuration.js";

export function cookieValue(request: Request, name: string): string {
  const cookie = request.headers.cookie
    ?.split(";")
    .find((part) => part.trimStart().startsWith(`${name}=`));
  return cookie?.trimStart().slice(name.length + 1) ?? "";
}

export function sessionCookie(config: IAppConfiguration): string {
  return config.appOrigin.protocol === "https:"
    ? "__Host-clean-connect-session"
    : "clean-connect-session";
}

@Controller("auth")
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(CONFIGURATION) private readonly config: IAppConfiguration,
  ) {}

  private get cookieOptions(): CookieOptions {
    return {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: this.config.appOrigin.protocol === "https:",
    };
  }

  private get flowCookie(): string {
    return this.cookieOptions.secure
      ? "__Host-clean-connect-login"
      : "clean-connect-login";
  }

  @Get("session")
  async session(@Req() request: Request) {
    return {
      authenticated: Boolean(
        await this.auth.account(
          cookieValue(request, sessionCookie(this.config)),
        ),
      ),
      loginAvailable: this.auth.available,
    };
  }

  @Get("login")
  async login(@Query("returnTo") returnTo: string, @Res() response: Response) {
    const path =
      typeof returnTo === "string" && /^\/(?:orders(?:\/\d+)?)?$/.test(returnTo)
        ? returnTo
        : "/orders";
    const { url, state } = await this.auth.begin(path);
    response.cookie(this.flowCookie, state, {
      ...this.cookieOptions,
      maxAge: LOGIN_SECONDS * 1000,
    });
    response.redirect(302, url);
  }

  @Get("callback")
  async callback(@Req() request: Request, @Res() response: Response) {
    const callback = new URL("/api/auth/callback", this.config.appOrigin);
    callback.search = new URL(
      request.originalUrl,
      this.config.appOrigin,
    ).search;
    const result = await this.auth.finish(
      callback,
      cookieValue(request, this.flowCookie),
    );
    response.clearCookie(this.flowCookie, this.cookieOptions);
    if (result.token) {
      const name = sessionCookie(this.config);
      await this.auth.logout(cookieValue(request, name));
      response.cookie(name, result.token, {
        ...this.cookieOptions,
        maxAge: SESSION_SECONDS * 1000,
      });
    }
    response.redirect(303, result.returnTo);
  }

  @Post("logout")
  @HttpCode(200)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const name = sessionCookie(this.config);
    await this.auth.logout(cookieValue(request, name));
    response.clearCookie(name, this.cookieOptions);
    return { authenticated: false };
  }
}
