import type { Logger } from "pino";
import type { RenderPayloadSingle, RenderPayloadTop } from "../types/market";
import type { ThemeId } from "../themes";
import { getBrowser } from "./browser";
import { buildSingleCardHtml, buildTopCollageHtml } from "./templates";

const SINGLE_DIMENSIONS = { width: 2048, height: 1316 };
const TOP_DIMENSIONS = { width: 1320, height: 840 };
const DEVICE_SCALE_FACTOR = 1;

interface RenderDimensions {
  width: number;
  height: number;
}

class RenderGate {
  private active = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(private readonly limit: number) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) {
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }

    this.active += 1;
    try {
      return await task();
    } finally {
      this.active -= 1;
      const next = this.waiters.shift();
      if (next) {
        next();
      }
    }
  }
}

interface CardRendererOptions {
  maxConcurrency?: number;
}

export class CardRenderer {
  private readonly gate: RenderGate;

  constructor(private readonly logger: Logger, options: CardRendererOptions = {}) {
    const requested = options.maxConcurrency ?? 4;
    const safeMax = Number.isFinite(requested) ? Math.max(1, Math.floor(requested)) : 4;
    this.gate = new RenderGate(safeMax);
  }

  private async htmlToPng(html: string, dimensions: RenderDimensions): Promise<Buffer> {
    return this.gate.run(async () => {
      const browser = await getBrowser();
      const page = await browser.newPage({
        viewport: {
          width: dimensions.width,
          height: dimensions.height
        },
        // High-density rendering keeps gradients and type sharp after Telegram compression.
        deviceScaleFactor: DEVICE_SCALE_FACTOR
      });

      try {
        await page.setContent(html, { waitUntil: "load" });
        const screenshot = await page.screenshot({ type: "png", scale: "css" });
        return screenshot as Buffer;
      } finally {
        await page.close();
      }
    });
  }

  async renderSingleCard(payload: RenderPayloadSingle): Promise<Buffer> {
    const startedAt = Date.now();
    const image = await this.htmlToPng(buildSingleCardHtml(payload), SINGLE_DIMENSIONS);
    this.logger.info({ renderMs: Date.now() - startedAt, kind: "single" }, "Rendered card image");
    return image;
  }

  async renderTopCollage(payload: RenderPayloadTop): Promise<Buffer> {
    const startedAt = Date.now();
    const image = await this.htmlToPng(buildTopCollageHtml(payload), TOP_DIMENSIONS);
    this.logger.info({ renderMs: Date.now() - startedAt, kind: "top" }, "Rendered card image");
    return image;
  }

  async renderThemePreview(themeId: ThemeId): Promise<Buffer> {
    return this.renderSingleCard({
      themeId,
      coin: {
        id: "bitcoin",
        symbol: "BTC",
        name: "Bitcoin",
        priceUsd: 82384.96,
        change24h: 1.85,
        change7d: 6.21,
        chart7d: [78_502, 79_440, 79_030, 80_221, 80_884, 80_014, 81_325, 82_038, 81_712, 82_834, 82_342, 83_126],
        fetchedAtIso: new Date().toISOString()
      }
    });
  }
}
