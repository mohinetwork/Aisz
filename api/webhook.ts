import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getApp } from "../src/app";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { bot, config, logger } = await getApp();

  // Basic security check for webhook secret token
  if (config.TELEGRAM_WEBHOOK_SECRET_TOKEN) {
    const provided = req.headers["x-telegram-bot-api-secret-token"];
    if (provided !== config.TELEGRAM_WEBHOOK_SECRET_TOKEN) {
      logger.warn("Rejected webhook update with invalid secret token");
      return res.status(401).json({ ok: false });
    }
  }

  // Handle only POST requests from Telegram
  if (req.method !== "POST") {
    return res.status(200).json({ ok: true, status: "Waiting for POST" });
  }

  try {
    // Telegraf handleUpdate can take the request body and the response object
    await bot.handleUpdate(req.body, res);
    
    // If bot.handleUpdate doesn't send a response, we send it here
    if (!res.writableEnded) {
      res.status(200).json({ ok: true });
    }
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : String(error) }, "Webhook update handling failed");
    if (!res.writableEnded) {
      res.status(500).json({ ok: false });
    }
  }
}
