import { createApp } from "./server/app.js";

async function main(): Promise<void> {
  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT должен быть числом от 1 до 65535.");
  }
  const app = await createApp({
    ...(process.env.CATALOG_PATH
      ? { catalogPath: process.env.CATALOG_PATH }
      : {}),
  });
  app.enableShutdownHooks();
  const host = process.env.BIND_HOST ?? "127.0.0.1";
  try {
    await app.listen(port, host);
  } catch (error) {
    await app.close();
    throw error;
  }
  console.log(`Clean Connect API запущен на ${host}:${port}.`);
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error
      ? error.message
      : "Не удалось запустить Clean Connect.",
  );
  process.exitCode = 1;
});
