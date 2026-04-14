"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildWebhookPath = buildWebhookPath;
exports.createHttpServer = createHttpServer;
const express_1 = __importDefault(require("express"));
function buildWebhookPath(secretPath) {
    return `/telegram/webhook/${secretPath}`;
}
function createHttpServer(params) {
    const app = (0, express_1.default)();
    const webhookPath = buildWebhookPath(params.secretPath);
    app.use(express_1.default.json({ limit: "2mb" }));
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
        }
        catch (error) {
            params.logger.error({ err: error instanceof Error ? error.message : String(error) }, "Webhook update handling failed");
            if (!res.headersSent) {
                res.status(500).json({ ok: false });
            }
        }
    });
    return { app, webhookPath };
}
