import path from "node:path";
import { loadConfig, type AppConfig } from "./config";
import { createLogger } from "./logger";
import { CoinGeckoService } from "./services/coingecko";
import { CardRenderer } from "./render/renderer";
import { createTelegramBot } from "./bot/telegramBot";
import { ThemeStateStore } from "./services/themeState";
import { ChatRateLimiter } from "./utils/throttle";
import type { Telegraf, Context } from "telegraf";
import type { Logger } from "pino";

export interface AppInstance {
  bot: Telegraf<Context>;
  config: AppConfig;
  logger: Logger;
}

let appInstance: AppInstance | undefined;

export async function getApp(): Promise<AppInstance> {
  if (appInstance) {
    return appInstance;
  }

  const config = loadConfig();
  const logger = createLogger(config.NODE_ENV === "development" ? "debug" : "info");

  const marketService = new CoinGeckoService({
    logger,
    apiKeys: config.COINGECKO_API_KEYS
  });

  const renderer = new CardRenderer(logger, {
    maxConcurrency: config.RENDER_MAX_CONCURRENCY
  });

  // For Vercel, we might want to use /tmp or an external DB.
  // We'll stick to the configured DATA_DIR for now, which the user should point to /tmp if on Vercel
  // or use a proper DB implementation (recommended).
  const themeState = new ThemeStateStore(path.resolve(config.DATA_DIR), logger);
  await themeState.init();
  
  const rateLimiter = new ChatRateLimiter(config.CHAT_MIN_INTERVAL_MS, config.RATE_LIMIT_IDLE_TTL_MS);

  const bot = createTelegramBot({ config, logger, marketService, renderer, themeState, rateLimiter });

  appInstance = { bot, config, logger };
  return appInstance;
}
