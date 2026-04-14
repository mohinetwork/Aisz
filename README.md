# Telegram Crypto Price Card Bot

Telegram bot that sends styled crypto price card images in groups for:

- `/btc`
- `/eth`
- `/sol`
- `/ltc`
- `/top`
- `/<symbol>` (e.g. `/xrp`, `/doge`, `/ton`)

## Features

- Node.js + TypeScript + Telegraf
- CoinGecko market data (with retry, stale-data fallback, in-memory TTL cache)
- HTML/CSS → PNG rendering via Playwright + `@sparticuz/chromium-min` (Vercel-compatible)
- 4 selectable themes per group: Violet Pulse · Aurora Stripe · Black & White · Neon Glass
- Private setup flow with theme preview, confirm, and add-to-group
- Private admin settings to change group theme
- Webhook-only mode on Vercel (no long-lived process)
- Text fallback when rendering or data fetch fails
- Durable theme state via Upstash / Vercel KV (or local filesystem in dev)

---

## Vercel Deployment

### 1 · Prerequisites

- A Telegram bot token from [@BotFather](https://t.me/BotFather)
- A [Vercel](https://vercel.com) account
- (Recommended) An [Upstash Redis](https://upstash.com) database **or** the Vercel KV add-on for durable theme state

### 2 · Environment variables

Set these in **Vercel → Project → Settings → Environment Variables**:

| Variable | Required | Notes |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | ✅ | From @BotFather |
| `WEBHOOK_SECRET_PATH` | ✅ | Random string, e.g. `abc123xyz` |
| `TELEGRAM_WEBHOOK_SECRET_TOKEN` | recommended | Min 8 chars, extra Telegram signature check |
| `KV_REST_API_URL` | for durable state | Upstash Redis REST URL or Vercel KV URL |
| `KV_REST_API_TOKEN` | for durable state | Upstash Redis token or Vercel KV token |
| `COINGECKO_API_KEYS` | optional | Comma-separated keys for higher rate limits |
| `SETUP_WEBHOOK_SECRET` | optional | Protects the POST `/api/setup-webhook` endpoint |

`WEBHOOK_BASE_URL` is **auto-derived** from `VERCEL_PROJECT_PRODUCTION_URL` / `VERCEL_URL` — you do not need to set it manually on Vercel.

### 3 · Deploy

```bash
npm install -g vercel
vercel --prod
```

Or connect the GitHub repo in the Vercel dashboard for automatic deploys.

### 4 · Register the Telegram webhook

After deployment, register the webhook by calling the setup endpoint:

```bash
# Check current webhook (no auth needed)
curl https://your-app.vercel.app/api/setup-webhook

# Register / update webhook (POST, protected by SETUP_WEBHOOK_SECRET if set)
curl -X POST "https://your-app.vercel.app/api/setup-webhook?secret=YOUR_SETUP_WEBHOOK_SECRET"
```

The endpoint is **idempotent** — it compares the desired URL against the current Telegram webhook and only calls `setWebhook` when they differ.

### 5 · Verify it works

```bash
# Health check
curl https://your-app.vercel.app/healthz

# Check webhook info
curl https://your-app.vercel.app/api/setup-webhook
```

Then open Telegram and send `/btc` to your bot.

---

## Persistence

Theme state (group themes, pending theme selections, user→group links) is stored in a key-value backend:

| Environment | Backend | Durability |
|---|---|---|
| Vercel + KV creds set | Upstash / Vercel KV | ✅ Durable across cold starts |
| Vercel, no KV creds | `/tmp` filesystem | ⚠️ Lost on cold starts |
| Local development | `DATA_DIR` filesystem | ✅ Persistent locally |

To add durable storage:
1. Create a free [Upstash Redis](https://upstash.com) database and copy the REST URL + token.
2. Set `KV_REST_API_URL` and `KV_REST_API_TOKEN` in Vercel env vars.
3. Redeploy.

---

## Local Development

```bash
# 1. Install (skip Playwright browser download — not needed locally if you have Chromium)
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install

# 2. Install Chromium for local rendering
npx playwright install chromium

# 3. Copy and fill env file
cp .env.example .env
# Set TELEGRAM_BOT_TOKEN and (for local testing with webhook) WEBHOOK_BASE_URL
# For pure local testing without a public URL, you can use polling:
# BOT_MODE=polling

# 4. Run in dev mode (hot reload)
npm run dev

# 5. Or build and start
npm run build && npm start
```

---

## Environment Variables Reference

| Variable | Default | Description |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | — | **Required.** Telegram bot token |
| `WEBHOOK_SECRET_PATH` | `crypto-price-hook` | Unique path token in the webhook URL |
| `TELEGRAM_WEBHOOK_SECRET_TOKEN` | — | Optional header-level signature check (min 8 chars) |
| `WEBHOOK_BASE_URL` | auto-derived on Vercel | Public base URL; auto-set from `VERCEL_PROJECT_PRODUCTION_URL` / `VERCEL_URL` |
| `KV_REST_API_URL` | — | Upstash / Vercel KV REST URL for durable state |
| `KV_REST_API_TOKEN` | — | Upstash / Vercel KV token |
| `COINGECKO_API_KEYS` | — | Comma-separated CoinGecko API keys |
| `SETUP_WEBHOOK_SECRET` | — | Protects POST `/api/setup-webhook` |
| `BOT_MODE` | `webhook` | `webhook` or `polling` (polling for local dev only) |
| `PORT` | `3000` | HTTP port (local only) |
| `NODE_ENV` | `development` | `development` / `production` / `test` |
| `DATA_DIR` | `./data` | Filesystem state dir (local dev only) |
| `CHAT_MIN_INTERVAL_MS` | `2000` | Per-chat rate limit interval |
| `RATE_LIMIT_IDLE_TTL_MS` | `21600000` | Rate limiter idle cleanup TTL |
| `RENDER_MAX_CONCURRENCY` | `4` (1 on Vercel) | Max concurrent Playwright renders |

---

## Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/webhook` | `POST` | Telegram webhook receiver |
| `/api/webhook` | `GET` | Health check |
| `/healthz` | `GET` | Health check (alias) |
| `/api/setup-webhook` | `GET` | Get current webhook info |
| `/api/setup-webhook` | `POST` | Register/update webhook (idempotent) |

---

## Private Setup Flow

1. Open the bot in private chat and send `/start`
2. Bot shows 4 theme buttons
3. Tap a theme → bot sends a preview card
4. Confirm theme → bot shows `Add Bot To Group` button
5. Add the bot to your group as admin
6. Group commands (`/btc`, `/eth`, `/sol`, `/ltc`, `/top`) render with the selected theme

To change the theme later, a group admin sends `/settings` in private chat.

---

## Vercel Limitations

- **Webhook-only** — the bot does not use polling on Vercel; it responds to Telegram push updates only.
- **Cold starts** — the first request after idle may be slower due to Chromium startup.
- **No always-on process** — webhook registration must be done explicitly via `/api/setup-webhook`.
- **Ephemeral `/tmp`** — without KV credentials, theme state is not durable across cold starts.
- **Function timeout** — rendering is capped at 25 s internally; Vercel function max is 60 s (`maxDuration` in `vercel.json`).

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Bot does not respond | Webhook not registered | Call `POST /api/setup-webhook` |
| `401` from Telegram | Wrong `TELEGRAM_BOT_TOKEN` | Check token in @BotFather |
| `403` from setup endpoint | Wrong `SETUP_WEBHOOK_SECRET` | Pass correct `?secret=` query param |
| `500` on webhook POST | App init failure | Check Vercel function logs for config errors |
| Render fails, text fallback used | Chromium launch failed or timeout | Check that `@sparticuz/chromium-min` is installed; see Vercel logs |
| Theme state lost after redeploy | No KV backend configured | Add `KV_REST_API_URL` + `KV_REST_API_TOKEN` |
| `WEBHOOK_BASE_URL` not set error | Missing Vercel URL env | Set `WEBHOOK_BASE_URL` manually, or ensure Vercel env vars are present |

---

## Test

```bash
npm test
```

