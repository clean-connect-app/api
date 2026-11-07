import type { NextFunction, Request, Response } from "express";

export function protectHttp(appOrigin: URL) {
  return (request: Request, response: Response, next: NextFunction): void => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("X-Frame-Options", "DENY");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("Cache-Control", "no-store");
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; " +
        "connect-src 'self'; object-src 'none'; base-uri 'none'; " +
        "frame-ancestors 'none'; form-action 'self'",
    );

    const write = ["POST", "PATCH", "PUT", "DELETE"].includes(request.method);
    // Для обратного прокси сохраняется Host внешнего веб-приложения.
    const directHealth =
      request.method === "GET" && request.path === "/api/health";
    if (
      (!directHealth && request.headers.host !== appOrigin.host) ||
      (write && request.headers.origin !== appOrigin.origin)
    ) {
      response.status(403).json({
        statusCode: 403,
        message: "Источник запроса не разрешён.",
      });
      return;
    }

    if (write && !request.is("application/json")) {
      response.status(415).json({
        statusCode: 415,
        message: "Используйте Content-Type application/json.",
      });
      return;
    }
    next();
  };
}
