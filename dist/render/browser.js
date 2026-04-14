"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.RENDER_TIMEOUT_MS = void 0;
exports.getBrowser = getBrowser;
exports.closeBrowser = closeBrowser;
const playwright_core_1 = require("playwright-core");
const RENDER_TIMEOUT_MS = 25_000;
exports.RENDER_TIMEOUT_MS = RENDER_TIMEOUT_MS;
let browserPromise;
async function launchBrowser() {
    if (process.env.VERCEL) {
        // Use @sparticuz/chromium-min for Vercel serverless environments.
        // The package bundles a stripped-down Chromium binary stored in /tmp on first run.
        const chromiumSparticuz = await Promise.resolve().then(() => __importStar(require("@sparticuz/chromium-min")));
        const executablePath = await chromiumSparticuz.default.executablePath();
        return playwright_core_1.chromium.launch({
            args: [
                ...chromiumSparticuz.default.args,
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--single-process"
            ],
            executablePath,
            // chromiumSparticuz.headless may be true | "shell" — playwright only accepts boolean
            headless: true
        });
    }
    // Local development — use the Playwright-managed Chromium
    return playwright_core_1.chromium.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
    });
}
async function getBrowser() {
    if (!browserPromise) {
        browserPromise = launchBrowser().catch((err) => {
            // Clear the promise on failure so the next call retries
            browserPromise = undefined;
            throw err;
        });
    }
    return browserPromise;
}
async function closeBrowser() {
    if (!browserPromise) {
        return;
    }
    try {
        const browser = await browserPromise;
        await browser.close();
    }
    catch {
        // Ignore close errors
    }
    finally {
        browserPromise = undefined;
    }
}
