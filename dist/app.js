"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getApp = getApp;
exports.resetApp = resetApp;
const node_path_1 = __importDefault(require("node:path"));
const config_1 = require("./config");
const logger_1 = require("./logger");
const coingecko_1 = require("./services/coingecko");
const renderer_1 = require("./render/renderer");
const telegramBot_1 = require("./bot/telegramBot");
const themeState_1 = require("./services/themeState");
const storage_1 = require("./services/storage");
const throttle_1 = require("./utils/throttle");
let appInstance;
function createStorageBackend(config, logger) {
    const isVercel = Boolean(process.env.VERCEL);
    const isProduction = config.NODE_ENV === "production";
    if (config.KV_REST_API_URL && config.KV_REST_API_TOKEN) {
        logger.info({ backend: "upstash-kv" }, "Storage: using Upstash / Vercel KV (durable)");
        return new storage_1.UpstashKvStorage(config.KV_REST_API_URL, config.KV_REST_API_TOKEN);
    }
    if (isVercel && isProduction) {
        // Running on Vercel in production without a durable KV — /tmp will be wiped on cold starts.
        // Log a clear warning but fall back to filesystem (/tmp) rather than crashing, so the bot
        // stays functional in a degraded state.
        logger.warn("No durable KV configured (KV_REST_API_URL / KV_REST_API_TOKEN missing). " +
            "Theme state will be lost on cold starts. " +
            "Add Vercel KV or Upstash Redis to make state durable.");
        return new storage_1.FileStorage(node_path_1.default.join("/tmp", "theme-state.json"));
    }
    if (isProduction) {
        // Non-Vercel production — use DATA_DIR filesystem storage
        logger.info({ backend: "filesystem", dir: config.DATA_DIR }, "Storage: using filesystem");
        return new storage_1.FileStorage(node_path_1.default.join(node_path_1.default.resolve(config.DATA_DIR), "theme-state.json"));
    }
    // Development / test — filesystem under DATA_DIR
    logger.info({ backend: "filesystem", dir: config.DATA_DIR }, "Storage: using filesystem (dev)");
    return new storage_1.FileStorage(node_path_1.default.join(node_path_1.default.resolve(config.DATA_DIR), "theme-state.json"));
}
async function getApp() {
    if (appInstance) {
        return appInstance;
    }
    const config = (0, config_1.loadConfig)();
    const logger = (0, logger_1.createLogger)(config.NODE_ENV === "development" ? "debug" : "info");
    logger.info({ env: config.NODE_ENV, mode: config.BOT_MODE }, "Initialising app");
    const marketService = new coingecko_1.CoinGeckoService({
        logger,
        apiKeys: config.COINGECKO_API_KEYS
    });
    const renderer = new renderer_1.CardRenderer(logger, {
        maxConcurrency: config.RENDER_MAX_CONCURRENCY
    });
    const storage = createStorageBackend(config, logger);
    const themeState = new themeState_1.ThemeStateStore(storage, logger);
    await themeState.init();
    const rateLimiter = new throttle_1.ChatRateLimiter(config.CHAT_MIN_INTERVAL_MS, config.RATE_LIMIT_IDLE_TTL_MS);
    const bot = (0, telegramBot_1.createTelegramBot)({ config, logger, marketService, renderer, themeState, rateLimiter });
    appInstance = { bot, config, logger };
    logger.info("App ready");
    return appInstance;
}
/** Reset the singleton — used in tests or to force re-initialisation. */
function resetApp() {
    appInstance = undefined;
}
