import { escapeHtml, formatPercent, formatUtcTimestamp, formatUsd } from "../utils/format";
import { getThemeLabel, type ThemeId } from "../themes";
import { createSparklineSvg } from "./sparkline";
import type { RenderPayloadSingle, RenderPayloadTop, TopCoinTile } from "../types/market";

const BOT_BRAND_LABEL = "Pwap BOT";

interface ThemeRenderStyle {
  id: ThemeId;
  fontFamily: string;
  bodyBackground: string;
  frameBackground: string;
  frameBorder: string;
  frameRadius: string;
  accent: string;
  accentSoft: string;
  positive: string;
  negative: string;
  panelBackground: string;
  panelBorder: string;
  textPrimary: string;
  textSecondary: string;
  labelMuted: string;
  chartLine: string;
  chartFillTop: string;
  chartFillBottom: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function formatCompactUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1
  }).format(value);
}

function formatSignedNumber(value: number): string {
  const sign = value >= 0 ? "+" : "-";
  const abs = Math.abs(value);
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(abs);

  return `${sign}${formatted}`;
}

function symbolGlyph(symbol: string): string {
  const upper = symbol.toUpperCase();
  if (upper === "BTC") {
    return "₿";
  }

  if (upper === "ETH") {
    return "Ξ";
  }

  if (upper === "LTC") {
    return "Ł";
  }

  return upper.slice(0, 1);
}

const THEME_STYLES: Record<ThemeId, ThemeRenderStyle> = {
  violet_pulse: {
    id: "violet_pulse",
    fontFamily: "'Space Grotesk', 'Satoshi', 'Manrope', 'Segoe UI', sans-serif",
    bodyBackground:
      "radial-gradient(1100px 620px at 12% -16%, rgba(183, 121, 255, 0.2), transparent 58%), radial-gradient(900px 500px at 88% 12%, rgba(125, 152, 255, 0.1), transparent 65%), #03020a",
    frameBackground:
      "linear-gradient(158deg, rgba(18, 12, 36, 0.99) 0%, rgba(7, 5, 18, 0.99) 70%, rgba(3, 2, 8, 1) 100%)",
    frameBorder: "rgba(187, 144, 255, 0.2)",
    frameRadius: "34px",
    accent: "#b78fff",
    accentSoft: "rgba(183,143,255,0.16)",
    positive: "#d3b5ff",
    negative: "#ff799d",
    panelBackground: "rgba(255,255,255,0.024)",
    panelBorder: "rgba(255,255,255,0.13)",
    textPrimary: "#f2edff",
    textSecondary: "rgba(232, 224, 248, 0.76)",
    labelMuted: "rgba(220, 212, 241, 0.62)",
    chartLine: "#b78fff",
    chartFillTop: "rgba(183,143,255,0.34)",
    chartFillBottom: "rgba(183,143,255,0.02)"
  },
  aurora_stripe: {
    id: "aurora_stripe",
    fontFamily: "'Clash Display', 'General Sans', 'Manrope', 'Segoe UI', sans-serif",
    bodyBackground:
      "radial-gradient(900px 520px at 88% -8%, rgba(255,117,157,0.18), transparent 58%), radial-gradient(700px 420px at 12% 18%, rgba(187,129,255,0.1), transparent 62%), #05040a",
    frameBackground:
      "linear-gradient(155deg, rgba(15,10,24,0.985) 0%, rgba(7,5,11,0.99) 72%, rgba(3,2,5,1) 100%)",
    frameBorder: "rgba(255, 140, 181, 0.2)",
    frameRadius: "34px",
    accent: "#ff7da8",
    accentSoft: "rgba(255,125,168,0.15)",
    positive: "#ff9fc3",
    negative: "#ff6e8f",
    panelBackground: "rgba(255,255,255,0.024)",
    panelBorder: "rgba(255,255,255,0.14)",
    textPrimary: "#fff3fa",
    textSecondary: "rgba(241, 222, 234, 0.78)",
    labelMuted: "rgba(233, 212, 224, 0.62)",
    chartLine: "#ff7da8",
    chartFillTop: "rgba(255,125,168,0.34)",
    chartFillBottom: "rgba(255,125,168,0.03)"
  },
  dark_black_white: {
    id: "dark_black_white",
    fontFamily: "'Space Grotesk', 'Manrope', 'Segoe UI', sans-serif",
    bodyBackground:
      "radial-gradient(1000px 560px at 35% -20%, rgba(255,255,255,0.08), transparent 60%), radial-gradient(700px 420px at 90% 5%, rgba(255,255,255,0.05), transparent 70%), #020202",
    frameBackground:
      "linear-gradient(152deg, rgba(16,16,16,0.99) 0%, rgba(7,7,7,0.99) 72%, rgba(2,2,2,1) 100%)",
    frameBorder: "rgba(255, 255, 255, 0.18)",
    frameRadius: "32px",
    accent: "#ffffff",
    accentSoft: "rgba(255,255,255,0.12)",
    positive: "#ffffff",
    negative: "#d8d8d8",
    panelBackground: "rgba(255,255,255,0.03)",
    panelBorder: "rgba(255,255,255,0.16)",
    textPrimary: "#f7f7f7",
    textSecondary: "rgba(232, 232, 232, 0.78)",
    labelMuted: "rgba(220, 220, 220, 0.62)",
    chartLine: "#ffffff",
    chartFillTop: "rgba(255,255,255,0.3)",
    chartFillBottom: "rgba(255,255,255,0.03)"
  },
  neon_glass: {
    id: "neon_glass",
    fontFamily: "'Space Grotesk', 'Manrope', 'Segoe UI', sans-serif",
    bodyBackground:
      "radial-gradient(960px 520px at 8% -14%, rgba(46,255,174,0.19), transparent 58%), radial-gradient(760px 460px at 92% 8%, rgba(84,215,255,0.08), transparent 64%), #020405",
    frameBackground:
      "linear-gradient(150deg, rgba(9,17,16,0.985) 0%, rgba(2,4,5,0.99) 70%, rgba(1,2,2,1) 100%)",
    frameBorder: "rgba(116, 255, 200, 0.16)",
    frameRadius: "34px",
    accent: "#34ffad",
    accentSoft: "rgba(52,255,173,0.15)",
    positive: "#61ffbe",
    negative: "#ff627c",
    panelBackground: "rgba(255,255,255,0.022)",
    panelBorder: "rgba(255,255,255,0.12)",
    textPrimary: "#eef4f6",
    textSecondary: "rgba(222, 231, 236, 0.74)",
    labelMuted: "rgba(217, 228, 233, 0.58)",
    chartLine: "#34ffad",
    chartFillTop: "rgba(52,255,173,0.34)",
    chartFillBottom: "rgba(52,255,173,0.02)"
  }
};

function getStyle(themeId: ThemeId): ThemeRenderStyle {
  return THEME_STYLES[themeId];
}

function percentColor(value: number, style: ThemeRenderStyle): string {
  return value >= 0 ? style.positive : style.negative;
}

function getTileBackground(themeId: ThemeId, index: number): string {
  const base = THEME_STYLES[themeId];
  const variants = {
    violet_pulse: [
      "linear-gradient(142deg, rgba(183,143,255,0.2), rgba(7,5,18,0.985))",
      "linear-gradient(142deg, rgba(141,160,255,0.17), rgba(6,7,18,0.985))",
      "linear-gradient(142deg, rgba(217,144,255,0.16), rgba(9,5,15,0.985))"
    ],
    aurora_stripe: [
      "linear-gradient(145deg, rgba(255,125,168,0.2), rgba(10,5,12,0.985))",
      "linear-gradient(145deg, rgba(187,135,255,0.18), rgba(8,5,14,0.985))",
      "linear-gradient(145deg, rgba(255,175,111,0.16), rgba(12,6,6,0.985))"
    ],
    dark_black_white: [
      "linear-gradient(145deg, rgba(255,255,255,0.13), rgba(8,8,8,0.99))",
      "linear-gradient(145deg, rgba(215,215,215,0.11), rgba(6,6,6,0.99))",
      "linear-gradient(145deg, rgba(235,235,235,0.1), rgba(4,4,4,0.99))"
    ],
    neon_glass: [
      "linear-gradient(140deg, rgba(52,255,173,0.19), rgba(4,10,8,0.985))",
      "linear-gradient(140deg, rgba(79,220,255,0.17), rgba(4,9,12,0.985))",
      "linear-gradient(140deg, rgba(255,192,103,0.17), rgba(10,8,4,0.985))"
    ]
  } as const;

  return variants[base.id][index % variants[base.id].length];
}

function buildThemeRows(themeId: ThemeId, coin: RenderPayloadSingle["coin"], style: ThemeRenderStyle): string {
  const sevenDayHigh = Math.max(...coin.chart7d);
  const sevenDayLow = Math.min(...coin.chart7d);

  return `
      <div class="stats">
        <div class="stat-tile">
          <div class="stat-label">7D HIGH</div>
          <div class="stat-value">${formatUsd(sevenDayHigh)}</div>
        </div>
        <div class="stat-tile">
          <div class="stat-label">7D LOW</div>
          <div class="stat-value">${formatUsd(sevenDayLow)}</div>
        </div>
        <div class="stat-tile">
          <div class="stat-label">UPDATED</div>
          <div class="stat-value">${formatUtcTimestamp(coin.fetchedAtIso)}</div>
        </div>
      </div>
`;
}

function buildOrbitHudSingleCardHtml(payload: RenderPayloadSingle): string {
  const { coin } = payload;
  const style = getStyle("violet_pulse");
  const sevenDayHigh = Math.max(...coin.chart7d);
  const sevenDayLow = Math.min(...coin.chart7d);
  const strength = clamp(Math.round(50 + coin.change24h * 5 + coin.change7d * 2), 1, 99);
  const dominance = clamp(18 + Math.log10(Math.max(coin.priceUsd, 1)) * 9, 8, 68);
  const volume24hEstimate = Math.max(500_000_000, coin.priceUsd * 550_000);

  const sparkline = createSparklineSvg(coin.chart7d, 760, 220, {
    lineColor: style.chartLine,
    fillTopColor: style.chartFillTop,
    fillBottomColor: style.chartFillBottom
  });

  return `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <style>
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        width: 1260px;
        height: 720px;
        font-family: ${style.fontFamily};
        background: radial-gradient(860px 380px at 16% -14%, ${style.accentSoft}, transparent 68%), #020304;
        color: ${style.textPrimary};
      }
      .canvas {
        box-sizing: border-box;
        width: 100%;
        height: 100%;
        padding: 20px;
      }
      .frame {
        box-sizing: border-box;
        width: 100%;
        height: 100%;
        border-radius: ${style.frameRadius};
        border: 1px solid ${style.frameBorder};
        background: ${style.frameBackground};
        box-shadow: 0 20px 80px rgba(0, 0, 0, 0.62);
        padding: 24px;
      }
      .main-grid {
        display: grid;
        grid-template-columns: 1.72fr 1fr;
        gap: 14px;
      }
      .left-panel,
      .right-panel {
        border-radius: 20px;
        border: 1px solid ${style.panelBorder};
        background: ${style.panelBackground};
      }
      .left-panel {
        padding: 20px;
      }
      .left-header {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
      }
      .coin-label {
        font-size: 51px;
        font-weight: 780;
        line-height: 1;
      }
      .coin-sub {
        margin-top: 4px;
        font-size: 18px;
        color: ${style.textSecondary};
      }
      .theme-mark {
        font-size: 24px;
        color: ${style.positive};
      }
      .price {
        margin-top: 18px;
        font-size: 96px;
        font-weight: 800;
        line-height: 1.02;
      }
      .change-row {
        margin-top: 10px;
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .change-badge {
        border-radius: 999px;
        border: 1px solid rgba(105, 255, 208, 0.38);
        background: rgba(83, 246, 190, 0.15);
        color: ${style.positive};
        padding: 7px 14px;
        font-size: 24px;
        font-weight: 760;
      }
      .change-amount {
        color: ${style.textSecondary};
        font-size: 24px;
        font-weight: 650;
      }
      .chart {
        margin-top: 14px;
        height: 220px;
        border-radius: 16px;
        border: 1px solid ${style.panelBorder};
        background: linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.015));
        overflow: hidden;
      }
      .right-panel {
        padding: 16px;
      }
      .right-title {
        font-size: 35px;
        font-weight: 700;
      }
      .ring-wrap {
        margin-top: 10px;
        display: grid;
        place-items: center;
      }
      .ring {
        width: 218px;
        height: 218px;
        border-radius: 50%;
        background: conic-gradient(${style.positive} 0 ${strength}%, rgba(182, 211, 220, 0.24) ${strength}% 100%);
        display: grid;
        place-items: center;
      }
      .ring-inner {
        width: 156px;
        height: 156px;
        border-radius: 50%;
        border: 1px solid ${style.panelBorder};
        background: rgba(2, 8, 9, 0.92);
        display: grid;
        place-items: center;
        font-size: 60px;
        color: ${style.positive};
        font-weight: 780;
      }
      .kpi {
        margin-top: 10px;
        border-radius: 14px;
        border: 1px solid ${style.panelBorder};
        background: rgba(255,255,255,0.02);
        padding: 10px 12px;
      }
      .kpi-label {
        font-size: 14px;
        color: ${style.labelMuted};
        letter-spacing: 0.08em;
      }
      .kpi-value {
        margin-top: 4px;
        font-size: 52px;
        line-height: 1;
        font-weight: 760;
      }
      .bottom-stats {
        margin-top: 12px;
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
      }
      .stat {
        border-radius: 14px;
        border: 1px solid ${style.panelBorder};
        background: linear-gradient(145deg, ${style.accentSoft}, rgba(255,255,255,0.02));
        padding: 10px 12px;
      }
      .stat-label {
        font-size: 13px;
        color: ${style.labelMuted};
        letter-spacing: 0.08em;
      }
      .stat-value {
        margin-top: 4px;
        font-size: 52px;
        line-height: 1;
        font-weight: 760;
      }
    </style>
  </head>
  <body>
    <div class="canvas">
      <div class="frame">
        <div class="main-grid">
          <div class="left-panel">
            <div class="left-header">
              <div>
                <div class="coin-label">${escapeHtml(coin.symbol)}</div>
                <div class="coin-sub">${escapeHtml(coin.name)} / Tether</div>
              </div>
              <div class="theme-mark">VIOLET PULSE</div>
            </div>

            <div class="price">${formatUsd(coin.priceUsd)}</div>

            <div class="change-row">
              <div class="change-badge">${formatPercent(coin.change24h)}</div>
              <div class="change-amount">${formatUsd(Math.abs((coin.priceUsd * coin.change24h) / 100))}</div>
            </div>

            <div class="chart">${sparkline}</div>
          </div>

          <div class="right-panel">
            <div class="right-title">Market Strength</div>
            <div class="ring-wrap">
              <div class="ring">
                <div class="ring-inner">${strength}</div>
              </div>
            </div>

            <div class="kpi">
              <div class="kpi-label">24H VOLUME</div>
              <div class="kpi-value">${formatCompactUsd(volume24hEstimate)}</div>
            </div>
            <div class="kpi">
              <div class="kpi-label">DOMINANCE</div>
              <div class="kpi-value">${dominance.toFixed(1)}%</div>
            </div>
          </div>
        </div>

        <div class="bottom-stats">
          <div class="stat">
            <div class="stat-label">24H HIGH</div>
            <div class="stat-value">${formatUsd(sevenDayHigh)}</div>
          </div>
          <div class="stat">
            <div class="stat-label">24H LOW</div>
            <div class="stat-value">${formatUsd(sevenDayLow)}</div>
          </div>
          <div class="stat">
            <div class="stat-label">7D CHANGE</div>
            <div class="stat-value">${formatPercent(coin.change7d)}</div>
          </div>
        </div>
      </div>
    </div>
  </body>
</html>`;
}

function renderTopTile(coin: TopCoinTile, index: number, themeId: ThemeId, style: ThemeRenderStyle): string {
  const pctColor = percentColor(coin.change24h, style);

  return `
<div class="tile" style="background:${getTileBackground(themeId, index)}">
  <div class="tile-top">
    <div class="coin-pill">${escapeHtml(coin.name)}</div>
    <div class="symbol">${escapeHtml(coin.symbol)}</div>
  </div>
  <div class="price">${formatUsd(coin.priceUsd)}</div>
  <div class="change" style="color:${pctColor}">${formatPercent(coin.change24h)}</div>
</div>`;
}

export function buildSingleCardHtml(payload: RenderPayloadSingle): string {
  const { coin, themeId } = payload;
  const style = getStyle(themeId);
  const dailyColor = percentColor(coin.change24h, style);
  const sevenDayHigh = Math.max(...coin.chart7d);
  const sevenDayLow = Math.min(...coin.chart7d);
  const volume24hEstimate = Math.max(500_000_000, coin.priceUsd * 550_000);
  const dayMove = (coin.priceUsd * coin.change24h) / 100;
  const hasDownsidePressure = coin.change24h < 0 || coin.change7d < 0;
  const sparklineLineColor = hasDownsidePressure ? "#ff4d6d" : style.chartLine;
  const sparklineFillTop = hasDownsidePressure ? "rgba(255, 77, 109, 0.36)" : style.chartFillTop;
  const sparklineFillBottom = hasDownsidePressure ? "rgba(255, 77, 109, 0.03)" : style.chartFillBottom;

  const sparkline = createSparklineSvg(coin.chart7d, 1570, 400, {
    lineColor: sparklineLineColor,
    fillTopColor: sparklineFillTop,
    fillBottomColor: sparklineFillBottom
  });

  const pairLabel = `${escapeHtml(coin.name)} / USDT`;
  const quoteMove = formatSignedNumber(dayMove);

  return `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <style>
      :root {
        color-scheme: dark;
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        width: 2048px;
        height: 1316px;
        font-family: ${style.fontFamily};
        background: radial-gradient(1240px 660px at 8% -6%, ${style.accentSoft}, transparent 64%), #010203;
        color: ${style.textPrimary};
      }
      .canvas {
        position: relative;
        width: 100%;
        height: 100%;
      }
      .frame {
        position: relative;
        left: 160px;
        top: 100px;
        box-sizing: border-box;
        width: 1710px;
        height: 1110px;
        padding: 52px 56px;
        border-radius: 52px;
        border: 1px solid ${style.frameBorder};
        background: ${style.frameBackground};
        box-shadow: 0 24px 90px rgba(0, 0, 0, 0.66);
        overflow: hidden;
      }
      .frame::before {
        content: "";
        position: absolute;
        inset: 0;
        background: repeating-linear-gradient(
          90deg,
          rgba(255, 255, 255, 0.02) 0,
          rgba(255, 255, 255, 0.02) 2px,
          transparent 2px,
          transparent 22px
        );
        pointer-events: none;
        mix-blend-mode: normal;
        opacity: 0.45;
      }
      .content {
        position: relative;
        z-index: 1;
        height: 100%;
        display: flex;
        flex-direction: column;
      }
      .header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
      }
      .coin-meta {
        display: flex;
        align-items: center;
        gap: 18px;
      }
      .coin-icon {
        width: 76px;
        height: 76px;
        border-radius: 22px;
        border: 1px solid ${style.panelBorder};
        background: linear-gradient(160deg, ${style.accentSoft}, rgba(255,255,255,0.02));
        color: ${style.accent};
        display: grid;
        place-items: center;
        font-size: 48px;
        font-weight: 780;
        line-height: 1;
      }
      .coin-code {
        font-size: 60px;
        line-height: 1;
        font-weight: 790;
      }
      .coin-sub {
        margin-top: 10px;
        font-size: 40px;
        line-height: 1;
        color: ${style.textSecondary};
      }
      .theme-pill {
        border-radius: 999px;
        padding: 18px 30px;
        border: 1px solid ${style.panelBorder};
        background: rgba(255,255,255,0.04);
        color: ${style.textSecondary};
        font-size: 40px;
        line-height: 1;
      }
      .price {
        margin-top: 28px;
        font-size: 150px;
        line-height: 1;
        font-weight: 810;
        letter-spacing: -0.015em;
      }
      .metrics {
        margin-top: 18px;
        display: flex;
        align-items: center;
        gap: 18px;
      }
      .quote {
        font-size: 54px;
        color: ${style.textSecondary};
        line-height: 1;
      }
      .badge {
        border-radius: 999px;
        padding: 13px 24px;
        font-size: 56px;
        font-weight: 770;
        border: 1px solid ${style.panelBorder};
        background: linear-gradient(145deg, ${style.accentSoft}, rgba(255,255,255,0.02));
        line-height: 1;
      }
      .quote-move {
        font-size: 54px;
        color: ${style.textSecondary};
        line-height: 1;
      }
      .chart {
        margin-top: 24px;
        flex: 1;
        min-height: 360px;
        width: 100%;
        border-radius: 32px;
        border: 1px solid ${style.panelBorder};
        background: linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.015));
        overflow: hidden;
      }
      .stats {
        margin-top: 20px;
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 18px;
      }
      .stat-tile {
        border-radius: 24px;
        border: 1px solid ${style.panelBorder};
        background: linear-gradient(145deg, ${style.accentSoft}, rgba(255,255,255,0.02));
        padding: 14px 18px;
      }
      .stat-label {
        font-size: 34px;
        letter-spacing: 0.07em;
        color: ${style.labelMuted};
        line-height: 1;
      }
      .stat-value {
        margin-top: 10px;
        font-size: 62px;
        line-height: 1;
        font-weight: 780;
      }
    </style>
  </head>
  <body>
    <div class="canvas">
      <div class="frame">
        <div class="content">
          <div class="header">
            <div class="coin-meta">
              <div class="coin-icon">${escapeHtml(symbolGlyph(coin.symbol))}</div>
              <div>
                <div class="coin-code">${escapeHtml(coin.symbol)}</div>
                <div class="coin-sub">${pairLabel}</div>
              </div>
            </div>
            <div class="theme-pill">${escapeHtml(BOT_BRAND_LABEL)}</div>
          </div>

          <div class="price">${formatUsd(coin.priceUsd)}</div>

          <div class="metrics">
            <div class="quote">USDT</div>
            <div class="badge" style="color:${dailyColor}">${formatPercent(coin.change24h)}</div>
            <div class="quote-move">${quoteMove}</div>
          </div>

          <div class="chart">${sparkline}</div>

          <div class="stats">
            <div class="stat-tile">
              <div class="stat-label">24H HIGH</div>
              <div class="stat-value">${formatUsd(sevenDayHigh)}</div>
            </div>
            <div class="stat-tile">
              <div class="stat-label">24H LOW</div>
              <div class="stat-value">${formatUsd(sevenDayLow)}</div>
            </div>
            <div class="stat-tile">
              <div class="stat-label">24H VOLUME</div>
              <div class="stat-value">${formatCompactUsd(volume24hEstimate)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </body>
</html>`;
}

export function buildTopCollageHtml(payload: RenderPayloadTop): string {
  const style = getStyle(payload.themeId);
  const cards = payload.coins.map((coin, index) => renderTopTile(coin, index, payload.themeId, style)).join("\n");

  return `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <style>
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        width: 1320px;
        height: 840px;
        font-family: ${style.fontFamily};
        background: radial-gradient(980px 440px at 16% -12%, ${style.accentSoft}, transparent 68%), #020304;
        color: ${style.textPrimary};
      }
      .canvas {
        box-sizing: border-box;
        width: 100%;
        height: 100%;
        padding: 22px;
      }
      .frame {
        box-sizing: border-box;
        width: 100%;
        height: 100%;
        border-radius: ${style.frameRadius};
        border: 1px solid ${style.frameBorder};
        background: ${style.frameBackground};
        padding: 24px;
      }
      .title {
        font-size: 40px;
        font-weight: 800;
      }
      .subtitle {
        color: ${style.textSecondary};
        font-size: 21px;
        margin-top: 6px;
        margin-bottom: 18px;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 14px;
      }
      .tile {
        border-radius: 18px;
        border: 1px solid ${style.panelBorder};
        padding: 16px;
        min-height: 190px;
      }
      .tile-top {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .coin-pill {
        font-size: 31px;
        font-weight: 740;
      }
      .symbol {
        font-size: 22px;
        color: ${style.textSecondary};
        letter-spacing: 0.04em;
      }
      .price {
        margin-top: 14px;
        font-size: 50px;
        font-weight: 800;
      }
      .change {
        margin-top: 8px;
        font-size: 40px;
        font-weight: 780;
      }
    </style>
  </head>
  <body>
    <div class="canvas">
      <div class="frame">
        <div class="title">Top 9 Crypto Snapshot • ${escapeHtml(getThemeLabel(payload.themeId))}</div>
        <div class="subtitle">Updated ${formatUtcTimestamp(payload.fetchedAtIso)} UTC</div>
        <div class="grid">${cards}</div>
      </div>
    </div>
  </body>
</html>`;
}
