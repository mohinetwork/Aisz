"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadConfig = loadConfig;
const zod_1 = require("zod");
const EnvSchema = zod_1.z.object({
    TELEGRAM_BOT_TOKEN: zod_1.z.string().min(1, "TELEGRAM_BOT_TOKEN is required"),
    BOT_MODE: zod_1.z.enum(["webhook", "polling"]).default("webhook"),
    WEBHOOK_BASE_URL: zod_1.z.string().url("WEBHOOK_BASE_URL must be a valid URL").optional(),
    WEBHOOK_SECRET_PATH: zod_1.z
        .string()
        .regex(/^[A-Za-z0-9_-]+$/, "WEBHOOK_SECRET_PATH can contain only letters, numbers, _ and -")
        .default("crypto-price-hook"),
    TELEGRAM_WEBHOOK_SECRET_TOKEN: zod_1.z.string().min(8).optional(),
    PORT: zod_1.z.coerce.number().int().positive().default(3000),
    NODE_ENV: zod_1.z.enum(["development", "production", "test"]).default("development"),
    // Comma-separated CoinGecko API keys (also accepts singular COINGECKO_API_KEY for backwards compat)
    COINGECKO_API_KEYS: zod_1.z
        .string()
        .optional()
        .transform((val) => val
        ? val
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : []),
    // For local development filesystem storage
    DATA_DIR: zod_1.z.string().default("./data"),
    CHAT_MIN_INTERVAL_MS: zod_1.z.coerce.number().int().positive().default(2000),
    RATE_LIMIT_IDLE_TTL_MS: zod_1.z.coerce.number().int().positive().default(6 * 60 * 60 * 1000),
    // On Vercel, keep concurrency at 1 to stay within memory limits
    RENDER_MAX_CONCURRENCY: zod_1.z.coerce.number().int().positive().max(24).default(4),
    // Upstash / Vercel KV credentials (required for durable state on Vercel)
    KV_REST_API_URL: zod_1.z.string().url().optional(),
    KV_REST_API_TOKEN: zod_1.z.string().min(1).optional(),
    // Setup webhook protection secret (optional; any non-empty value enables the check)
    SETUP_WEBHOOK_SECRET: zod_1.z.string().min(8).optional()
});
function resolveWebhookBaseUrl(env) {
    if (env.WEBHOOK_BASE_URL)
        return env.WEBHOOK_BASE_URL;
    // Vercel provides VERCEL_PROJECT_PRODUCTION_URL for the canonical domain,
    // and VERCEL_URL for the deployment-specific URL.
    if (env.VERCEL_PROJECT_PRODUCTION_URL)
        return `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`;
    if (env.VERCEL_URL)
        return `https://${env.VERCEL_URL}`;
    return undefined;
}
function loadConfig(env = process.env) {
    // Mutate a copy so we don't affect the original process.env object
    const effective = { ...env };
    // Auto-derive WEBHOOK_BASE_URL from Vercel env when not set explicitly
    const derivedBase = resolveWebhookBaseUrl(env);
    if (derivedBase) {
        effective.WEBHOOK_BASE_URL = derivedBase;
    }
    // Accept singular COINGECKO_API_KEY as alias for COINGECKO_API_KEYS
    if (!effective.COINGECKO_API_KEYS && effective.COINGECKO_API_KEY) {
        effective.COINGECKO_API_KEYS = effective.COINGECKO_API_KEY;
    }
    // On Vercel, default concurrency to 1 to avoid OOM
    if (effective.VERCEL && !effective.RENDER_MAX_CONCURRENCY) {
        effective.RENDER_MAX_CONCURRENCY = "1";
    }
    const parsed = EnvSchema.safeParse(effective);
    if (!parsed.success) {
        const messages = parsed.error.issues.map((i) => `  • ${i.path.join(".")}: ${i.message}`).join("\n");
        throw new Error(`Configuration error — fix the following env vars:\n${messages}`);
    }
    return {
        ...parsed.data,
        WEBHOOK_BASE_URL: parsed.data.WEBHOOK_BASE_URL?.replace(/\/+$/, "")
    };
}
