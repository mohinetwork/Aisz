# Telegram Crypto Price Card Bot

Telegram bot that sends styled crypto price card images in groups for:

- `/btc`
- `/eth`
- `/sol`
- `/ltc`
- `/top`
- `/<symbol>` (for example `/xrp`, `/doge`, `/ton`)

## Features

- Node.js + TypeScript + Telegraf
- CoinGecko market data
- HTML/CSS to PNG rendering via Playwright
- 4 selectable themes per group:
  - Violet Pulse
  - Aurora Stripe
  - Black & White
  - Neon Glass
- Private setup flow with theme preview, confirm, and add-to-group
- Private admin settings to change group theme later
- Webhook mode for Railway/Render
- Text fallback on render/data issues
- In-memory TTL caching + per-chat lightweight throttling
- CoinGecko retry + concurrent request de-duplication + stale-data fallback
- Render concurrency gate for stable high-load performance
- Persistent local theme state in JSON (`DATA_DIR/theme-state.json`)

## Setup

1. Install dependencies:

```bash
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install
```

2. Copy env file and fill values:

```bash
cp .env.example .env
```

3. Install Chromium once (needed for image rendering):

```bash
npx playwright install chromium
```

4. Build and run:

```bash
npm run build
npm start
```

## Environment Variables

- `TELEGRAM_BOT_TOKEN` (required)
- `BOT_MODE` (`webhook` or `polling`, default `webhook`)
- `WEBHOOK_BASE_URL` (required only when `BOT_MODE=webhook`, public URL)
- `WEBHOOK_SECRET_PATH` (required, safe random value)
- `TELEGRAM_WEBHOOK_SECRET_TOKEN` (optional but recommended for webhook signature check)
- `PORT` (default `3000`)
- `NODE_ENV` (`development`/`production`/`test`)
- `DATA_DIR` (default `./data`)
- `COINGECKO_API_KEY` (optional)
- `CHAT_MIN_INTERVAL_MS` (default `2000`)
- `RATE_LIMIT_IDLE_TTL_MS` (default `21600000`)
- `RENDER_MAX_CONCURRENCY` (default `4`)

## Private Setup Flow

1. User opens bot in private chat and runs `/start`
2. Bot shows 4 theme buttons
3. User taps any theme -> bot sends preview card
4. User confirms theme -> bot shows `Add Bot To Group` button
5. User adds bot in group as admin
6. Group price commands (`/btc`, `/eth`, `/sol`, `/ltc`, `/top`) now render with that selected theme

To change theme later, admin uses private chat command:

`/settings`

## Webhook Endpoint

`POST /telegram/webhook/<WEBHOOK_SECRET_PATH>`

Health endpoint:

`GET /healthz`

## Test

```bash
npm test
```

## Notes

- Currency is fixed to USD in v1.
- `/top` returns one collage image of top 9 market-cap coins.
- If image rendering fails, bot sends text format fallback.
- Local quick run without public URL: set `BOT_MODE=polling`.
- Group chats are command-only for price cards; setup/settings are private-chat only.
- Price commands work in both group and private chat.
- `/top` returns top 9 coins by market cap in one collage (not all coins).
