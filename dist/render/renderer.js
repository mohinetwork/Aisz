"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CardRenderer = void 0;
const browser_1 = require("./browser");
const templates_1 = require("./templates");
const SINGLE_DIMENSIONS = { width: 2048, height: 1316 };
const TOP_DIMENSIONS = { width: 1320, height: 840 };
const DEVICE_SCALE_FACTOR = 1;
class RenderGate {
    limit;
    active = 0;
    waiters = [];
    constructor(limit) {
        this.limit = limit;
    }
    async run(task) {
        if (this.active >= this.limit) {
            await new Promise((resolve) => this.waiters.push(resolve));
        }
        this.active += 1;
        try {
            return await task();
        }
        finally {
            this.active -= 1;
            const next = this.waiters.shift();
            if (next) {
                next();
            }
        }
    }
}
function withTimeout(promise, ms, label) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Render timeout after ${ms}ms (${label})`)), ms);
        promise.then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
    });
}
class CardRenderer {
    logger;
    gate;
    constructor(logger, options = {}) {
        this.logger = logger;
        const requested = options.maxConcurrency ?? 4;
        const safeMax = Number.isFinite(requested) ? Math.max(1, Math.floor(requested)) : 4;
        this.gate = new RenderGate(safeMax);
    }
    async htmlToPng(html, dimensions, label) {
        return this.gate.run(async () => {
            const browser = await (0, browser_1.getBrowser)();
            const page = await browser.newPage({
                viewport: {
                    width: dimensions.width,
                    height: dimensions.height
                },
                deviceScaleFactor: DEVICE_SCALE_FACTOR
            });
            try {
                await withTimeout(page.setContent(html, { waitUntil: "load" }), browser_1.RENDER_TIMEOUT_MS, `setContent:${label}`);
                const screenshot = await withTimeout(page.screenshot({ type: "png", scale: "css" }), browser_1.RENDER_TIMEOUT_MS, `screenshot:${label}`);
                return screenshot;
            }
            finally {
                await page.close().catch((e) => {
                    this.logger.debug({ err: String(e) }, "Page close error (ignored)");
                });
            }
        });
    }
    async renderSingleCard(payload) {
        const startedAt = Date.now();
        const image = await this.htmlToPng((0, templates_1.buildSingleCardHtml)(payload), SINGLE_DIMENSIONS, "single");
        this.logger.info({ renderMs: Date.now() - startedAt, kind: "single" }, "Rendered card image");
        return image;
    }
    async renderTopCollage(payload) {
        const startedAt = Date.now();
        const image = await this.htmlToPng((0, templates_1.buildTopCollageHtml)(payload), TOP_DIMENSIONS, "top");
        this.logger.info({ renderMs: Date.now() - startedAt, kind: "top" }, "Rendered card image");
        return image;
    }
    async renderThemePreview(themeId) {
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
exports.CardRenderer = CardRenderer;
