import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getApp } from "../src/app";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Health-check endpoint — safe for GET
  if (req.method === "GET") {
    return res.status(200).json({ ok: true, status: "webhook handler online" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  let app: Awaited<ReturnType<typeof getApp>>;
  try {
    app = await getApp();
  } catch (initError) {
    console.error("App init failed", initError);
    return res.status(500).json({ ok: false, error: "Internal Server Error (init)" });
  }

  const { bot, config, logger } = app;

  // Verify Telegram webhook secret token when configured
  if (config.TELEGRAM_WEBHOOK_SECRET_TOKEN) {
    const provided = req.headers["x-telegram-bot-api-secret-token"];
    if (provided !== config.TELEGRAM_WEBHOOK_SECRET_TOKEN) {
      logger.warn({ ip: req.headers["x-forwarded-for"] }, "Rejected webhook update: invalid secret token");
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }
  }

  // Validate body is present and looks like a Telegram update
  const body = req.body;
  if (!body || typeof body !== "object" || typeof body.update_id !== "number") {
    logger.warn({ body: typeof body }, "Received non-update POST body; ignoring");
    return res.status(200).json({ ok: true });
  }

  try {
    await bot.handleUpdate(body, res);
    if (!res.writableEnded) {
      res.status(200).json({ ok: true });
    }
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : String(error) }, "Webhook update handling failed");
    if (!res.writableEnded) {
      res.status(500).json({ ok: false, error: "Internal Server Error" });
    }
  }
}

