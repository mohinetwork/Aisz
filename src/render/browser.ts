import type { Browser } from "playwright-core";
import { chromium } from "playwright-core";

let browserPromise: Promise<Browser> | undefined;

async function launchBrowser(): Promise<Browser> {
  // If we are on Vercel, we need to use sparticuz/chromium
  if (process.env.VERCEL) {
    // Dynamically import to avoid issues in local environments without the package
    const chromiumSparticuz = await import("@sparticuz/chromium-min");
    
    return chromium.launch({
      args: chromiumSparticuz.default.args,
      executablePath: await chromiumSparticuz.default.executablePath(),
      headless: chromiumSparticuz.default.headless,
    });
  }

  // Local development
  return chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });
}

export async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = launchBrowser();
  }

  return browserPromise;
}

export async function closeBrowser(): Promise<void> {
  if (!browserPromise) {
    return;
  }

  const browser = await browserPromise;
  await browser.close();
  browserPromise = undefined;
}

