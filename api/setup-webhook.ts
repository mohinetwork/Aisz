/**
 * Protected setup endpoint for registering the Telegram webhook.
 * Call this once after deployment (or whenever the webhook URL changes).
 *
 * GET  /api/setup-webhook             — returns current webhook info (no auth required)
 * POST /api/setup-webhook?secret=...  — registers/updates the webhook (requires SETUP_WEBHOOK_SECRET)
 *
 * The POST is idempotent: it compares the desired URL against the currently registered one
 * and only calls setWebhook when they differ.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getApp } from "../src/app";
import { buildWebhookPath } from "../src/server/httpServer";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  let app: Awaited<ReturnType<typeof getApp>>;
  try {
    app = await getApp();
  } catch (initError) {
    console.error("App init failed in setup-webhook", initError);
    return res.status(500).json({ ok: false, error: "Internal Server Error (init)" });
  }

  const { bot, config, logger } = app;

  // GET — return current webhook info (public, safe for health checks)
  if (req.method === "GET") {
    try {
      const info = await bot.telegram.getWebhookInfo();
      return res.status(200).json({ ok: true, webhook: info });
    } catch (err) {
      logger.error({ err: String(err) }, "getWebhookInfo failed");
      return res.status(500).json({ ok: false, error: "Failed to get webhook info" });
    }
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  // POST — register/update webhook (protected)
  if (config.SETUP_WEBHOOK_SECRET) {
    const provided = (req.query.secret ?? req.headers["x-setup-secret"]) as string | undefined;
    if (!provided || provided !== config.SETUP_WEBHOOK_SECRET) {
      logger.warn({ ip: req.headers["x-forwarded-for"] }, "setup-webhook: unauthorized attempt");
      return res.status(403).json({ ok: false, error: "Forbidden" });
    }
  }

  if (!config.WEBHOOK_BASE_URL) {
    return res.status(400).json({
      ok: false,
      error:
        "WEBHOOK_BASE_URL is not set. Set it explicitly or ensure VERCEL_PROJECT_PRODUCTION_URL / VERCEL_URL env vars are available."
    });
  }

  const webhookPath = buildWebhookPath(config.WEBHOOK_SECRET_PATH);
  const desiredUrl = `${config.WEBHOOK_BASE_URL}${webhookPath}`;

  try {
    const info = await bot.telegram.getWebhookInfo();
    logger.info({ current: info.url, desired: desiredUrl }, "Webhook reconciliation");

    if (info.url === desiredUrl && !info.has_custom_certificate) {
      logger.info("Webhook already up to date — skipping setWebhook");
      return res.status(200).json({ ok: true, action: "noop", url: desiredUrl, info });
    }

    await bot.telegram.setWebhook(desiredUrl, {
      secret_token: config.TELEGRAM_WEBHOOK_SECRET_TOKEN
    });

    logger.info({ url: desiredUrl }, "Webhook registered successfully");
    return res.status(200).json({ ok: true, action: "updated", url: desiredUrl });
  } catch (err) {
    logger.error({ err: String(err) }, "setWebhook failed");
    return res.status(500).json({ ok: false, error: "setWebhook failed" });
  }
}
