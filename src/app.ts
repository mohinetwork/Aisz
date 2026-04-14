import path from "node:path";
import { loadConfig, type AppConfig } from "./config";
import { createLogger } from "./logger";
import { CoinGeckoService } from "./services/coingecko";
import { CardRenderer } from "./render/renderer";
import { createTelegramBot } from "./bot/telegramBot";
import { ThemeStateStore } from "./services/themeState";
import { MemoryStorage, FileStorage, UpstashKvStorage } from "./services/storage";
import { ChatRateLimiter } from "./utils/throttle";
import type { Telegraf, Context } from "telegraf";
import type { Logger } from "pino";

export interface AppInstance {
  bot: Telegraf<Context>;
  config: AppConfig;
  logger: Logger;
}

let appInstance: AppInstance | undefined;

function createStorageBackend(config: AppConfig, logger: Logger) {
  const isVercel = Boolean(process.env.VERCEL);
  const isProduction = config.NODE_ENV === "production";

  if (config.KV_REST_API_URL && config.KV_REST_API_TOKEN) {
    logger.info({ backend: "upstash-kv" }, "Storage: using Upstash / Vercel KV (durable)");
    return new UpstashKvStorage(config.KV_REST_API_URL, config.KV_REST_API_TOKEN);
  }

  if (isVercel && isProduction) {
    // Running on Vercel in production without a durable KV — /tmp will be wiped on cold starts.
    // Log a clear warning but fall back to filesystem (/tmp) rather than crashing, so the bot
    // stays functional in a degraded state.
    logger.warn(
      "No durable KV configured (KV_REST_API_URL / KV_REST_API_TOKEN missing). " +
        "Theme state will be lost on cold starts. " +
        "Add Vercel KV or Upstash Redis to make state durable."
    );
    return new FileStorage(path.join("/tmp", "theme-state.json"));
  }

  if (isProduction) {
    // Non-Vercel production — use DATA_DIR filesystem storage
    logger.info({ backend: "filesystem", dir: config.DATA_DIR }, "Storage: using filesystem");
    return new FileStorage(path.join(path.resolve(config.DATA_DIR), "theme-state.json"));
  }

  // Development / test — filesystem under DATA_DIR
  logger.info({ backend: "filesystem", dir: config.DATA_DIR }, "Storage: using filesystem (dev)");
  return new FileStorage(path.join(path.resolve(config.DATA_DIR), "theme-state.json"));
}

export async function getApp(): Promise<AppInstance> {
  if (appInstance) {
    return appInstance;
  }

  const config = loadConfig();
  const logger = createLogger(config.NODE_ENV === "development" ? "debug" : "info");

  logger.info({ env: config.NODE_ENV, mode: config.BOT_MODE }, "Initialising app");

  const marketService = new CoinGeckoService({
    logger,
    apiKeys: config.COINGECKO_API_KEYS
  });

  const renderer = new CardRenderer(logger, {
    maxConcurrency: config.RENDER_MAX_CONCURRENCY
  });

  const storage = createStorageBackend(config, logger);
  const themeState = new ThemeStateStore(storage, logger);
  await themeState.init();

  const rateLimiter = new ChatRateLimiter(config.CHAT_MIN_INTERVAL_MS, config.RATE_LIMIT_IDLE_TTL_MS);

  const bot = createTelegramBot({ config, logger, marketService, renderer, themeState, rateLimiter });

  appInstance = { bot, config, logger };
  logger.info("App ready");
  return appInstance;
}

/** Reset the singleton — used in tests or to force re-initialisation. */
export function resetApp(): void {
  appInstance = undefined;
}

