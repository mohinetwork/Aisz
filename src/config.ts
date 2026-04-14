import { z } from "zod";

const EnvSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1, "TELEGRAM_BOT_TOKEN is required"),
  BOT_MODE: z.enum(["webhook", "polling"]).default("webhook"),
  WEBHOOK_BASE_URL: z.string().url("WEBHOOK_BASE_URL must be a valid URL").optional(),
  WEBHOOK_SECRET_PATH: z
    .string()
    .regex(/^[A-Za-z0-9_-]+$/, "WEBHOOK_SECRET_PATH can contain only letters, numbers, _ and -")
    .default("crypto-price-hook"),
  TELEGRAM_WEBHOOK_SECRET_TOKEN: z.string().min(8).optional(),
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  // Comma-separated CoinGecko API keys (also accepts singular COINGECKO_API_KEY for backwards compat)
  COINGECKO_API_KEYS: z
    .string()
    .optional()
    .transform((val) =>
      val
        ? val
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : []
    ),
  // For local development filesystem storage
  DATA_DIR: z.string().default("./data"),
  CHAT_MIN_INTERVAL_MS: z.coerce.number().int().positive().default(2000),
  RATE_LIMIT_IDLE_TTL_MS: z.coerce.number().int().positive().default(6 * 60 * 60 * 1000),
  // On Vercel, keep concurrency at 1 to stay within memory limits
  RENDER_MAX_CONCURRENCY: z.coerce.number().int().positive().max(24).default(4),
  // Upstash / Vercel KV credentials (required for durable state on Vercel)
  KV_REST_API_URL: z.string().url().optional(),
  KV_REST_API_TOKEN: z.string().min(1).optional(),
  // Setup webhook protection secret (optional; any non-empty value enables the check)
  SETUP_WEBHOOK_SECRET: z.string().min(8).optional()
});

export type AppConfig = z.infer<typeof EnvSchema>;

function resolveWebhookBaseUrl(env: NodeJS.ProcessEnv): string | undefined {
  if (env.WEBHOOK_BASE_URL) return env.WEBHOOK_BASE_URL;
  // Vercel provides VERCEL_PROJECT_PRODUCTION_URL for the canonical domain,
  // and VERCEL_URL for the deployment-specific URL.
  if (env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (env.VERCEL_URL) return `https://${env.VERCEL_URL}`;
  return undefined;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  // Mutate a copy so we don't affect the original process.env object
  const effective: NodeJS.ProcessEnv = { ...env };

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

  // Keep production deployments webhook-only (including Vercel),
  // so we never require long-lived polling workers there.
  if ((effective.VERCEL || effective.NODE_ENV === "production") && effective.BOT_MODE === "polling") {
    if (effective.NODE_ENV !== "test") {
      console.warn("BOT_MODE=polling is not supported on Vercel/production; forcing BOT_MODE=webhook");
    }
    effective.BOT_MODE = "webhook";
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
