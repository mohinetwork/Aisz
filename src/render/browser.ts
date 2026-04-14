import type { Browser } from "playwright-core";
import { chromium } from "playwright-core";

const RENDER_TIMEOUT_MS = 25_000;

let browserPromise: Promise<Browser> | undefined;

async function launchBrowser(): Promise<Browser> {
  if (process.env.VERCEL) {
    // Use @sparticuz/chromium-min for Vercel serverless environments.
    // The package bundles a stripped-down Chromium binary stored in /tmp on first run.
    const chromiumSparticuz = await import("@sparticuz/chromium-min");
    const executablePath = await chromiumSparticuz.default.executablePath();

    return chromium.launch({
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
  return chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
  });
}

export async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = launchBrowser().catch((err) => {
      // Clear the promise on failure so the next call retries
      browserPromise = undefined;
      throw err;
    });
  }
  return browserPromise;
}

export async function closeBrowser(): Promise<void> {
  if (!browserPromise) {
    return;
  }
  try {
    const browser = await browserPromise;
    await browser.close();
  } catch {
    // Ignore close errors
  } finally {
    browserPromise = undefined;
  }
}

export { RENDER_TIMEOUT_MS };


