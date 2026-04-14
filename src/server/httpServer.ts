import express, { type Express } from "express";
import type { Telegraf, Context } from "telegraf";
import type { Logger } from "pino";

export function buildWebhookPath(secretPath: string): string {
  return `/telegram/webhook/${secretPath}`;
}

interface CreateHttpServerParams {
  bot: Telegraf<Context>;
  secretPath: string;
  secretToken?: string;
  logger: Logger;
}

export function createHttpServer(params: CreateHttpServerParams): {
  app: Express;
  webhookPath: string;
} {
  const app = express();
  const webhookPath = buildWebhookPath(params.secretPath);

  app.use(express.json({ limit: "2mb" }));

  app.get("/healthz", (_req, res) => {
    res.status(200).json({ ok: true, uptimeSec: Math.round(process.uptime()) });
  });

  app.post(webhookPath, async (req, res) => {
    if (params.secretToken) {
      const provided = req.header("x-telegram-bot-api-secret-token");
      if (provided !== params.secretToken) {
        params.logger.warn("Rejected webhook update with invalid secret token");
        res.status(401).json({ ok: false });
        return;
      }
    }

    try {
      await params.bot.handleUpdate(req.body, res);
      if (!res.headersSent) {
        res.status(200).json({ ok: true });
      }
    } catch (error) {
      params.logger.error(
        { err: error instanceof Error ? error.message : String(error) },
        "Webhook update handling failed"
      );
      if (!res.headersSent) {
        res.status(500).json({ ok: false });
      }
    }
  });

  return { app, webhookPath };
}
