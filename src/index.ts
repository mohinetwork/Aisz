import { createServer, type Server } from "node:http";
import { getApp } from "./app";
import { createHttpServer } from "./server/httpServer";
import { closeBrowser } from "./render/browser";

async function main(): Promise<void> {
  const { bot, config, logger } = await getApp();

  let httpServer: Server | undefined;

  if (config.BOT_MODE === "webhook") {
    const { app, webhookPath } = createHttpServer({
      bot,
      secretPath: config.WEBHOOK_SECRET_PATH,
      secretToken: config.TELEGRAM_WEBHOOK_SECRET_TOKEN,
      logger
    });

    httpServer = createServer(app);

    await new Promise<void>((resolve) => {
      httpServer?.listen(config.PORT, () => {
        logger.info({ port: config.PORT }, "HTTP server started");
        resolve();
      });
    });

    const fullWebhookUrl = `${config.WEBHOOK_BASE_URL}${webhookPath}`;
    await bot.telegram.setWebhook(fullWebhookUrl, {
      secret_token: config.TELEGRAM_WEBHOOK_SECRET_TOKEN
    });
    logger.info({ webhook: fullWebhookUrl }, "Telegram webhook configured");
  } else {
    await bot.telegram.deleteWebhook({ drop_pending_updates: false });
    await bot.launch();
    logger.info("Telegram bot started in polling mode");
  }

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, "Shutting down");

    if (config.BOT_MODE === "webhook") {
      try {
        await bot.telegram.deleteWebhook();
      } catch {
        logger.warn("Failed to delete webhook during shutdown");
      }
    } else {
      bot.stop(signal);
    }

    await closeBrowser();

    if (httpServer) {
      await new Promise<void>((resolve) => httpServer?.close(() => resolve()));
    }

    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Fatal startup error", error);
  process.exit(1);
});

