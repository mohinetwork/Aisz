import { z } from "zod";

const EnvSchema = z
  .object({
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
    DATA_DIR: z.string().default("./data"),
    CHAT_MIN_INTERVAL_MS: z.coerce.number().int().positive().default(2000),
    RATE_LIMIT_IDLE_TTL_MS: z.coerce.number().int().positive().default(6 * 60 * 60 * 1000),
    RENDER_MAX_CONCURRENCY: z.coerce.number().int().positive().max(24).default(4)
  })
  .superRefine((value, context) => {
    if (value.BOT_MODE === "webhook" && !value.WEBHOOK_BASE_URL) {
      context.addIssue({
        code: "custom",
        message: "WEBHOOK_BASE_URL is required when BOT_MODE=webhook",
        path: ["WEBHOOK_BASE_URL"]
      });
    }
  });

export type AppConfig = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  // If running on Vercel and WEBHOOK_BASE_URL is not provided, 
  // try to construct it from VERCEL_URL.
  if (env.VERCEL && !env.WEBHOOK_BASE_URL && env.VERCEL_URL) {
    env.WEBHOOK_BASE_URL = `https://${env.VERCEL_URL}`;
  }

  const parsed = EnvSchema.parse(env);

  return {
    ...parsed,
    WEBHOOK_BASE_URL: parsed.WEBHOOK_BASE_URL?.replace(/\/+$/, "")
  };
}

