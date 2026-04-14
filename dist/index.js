"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_http_1 = require("node:http");
const app_1 = require("./app");
const httpServer_1 = require("./server/httpServer");
const browser_1 = require("./render/browser");
async function main() {
    const { bot, config, logger } = await (0, app_1.getApp)();
    let httpServer;
    if (config.BOT_MODE === "webhook") {
        const { app, webhookPath } = (0, httpServer_1.createHttpServer)({
            bot,
            secretPath: config.WEBHOOK_SECRET_PATH,
            secretToken: config.TELEGRAM_WEBHOOK_SECRET_TOKEN,
            logger
        });
        httpServer = (0, node_http_1.createServer)(app);
        await new Promise((resolve) => {
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
    }
    else {
        await bot.telegram.deleteWebhook({ drop_pending_updates: false });
        await bot.launch();
        logger.info("Telegram bot started in polling mode");
    }
    const shutdown = async (signal) => {
        logger.info({ signal }, "Shutting down");
        if (config.BOT_MODE === "webhook") {
            try {
                await bot.telegram.deleteWebhook();
            }
            catch {
                logger.warn("Failed to delete webhook during shutdown");
            }
        }
        else {
            bot.stop(signal);
        }
        await (0, browser_1.closeBrowser)();
        if (httpServer) {
            await new Promise((resolve) => httpServer?.close(() => resolve()));
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
