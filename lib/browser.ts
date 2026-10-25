import { chromium, type BrowserContext } from "playwright-core";
import sparticuz from "@sparticuz/chromium";

export async function openContext(): Promise<{ ctx: BrowserContext; close: () => Promise<void> }> {
  const storageState = process.env.MEDIROUND_STORAGE_STATE ? JSON.parse(process.env.MEDIROUND_STORAGE_STATE) : undefined;
  if (process.env.BROWSER_WS_ENDPOINT) {
    const browser = await chromium.connectOverCDP(process.env.BROWSER_WS_ENDPOINT);
    const ctx = browser.contexts()[0] ?? (await browser.newContext({ storageState }));
    return { ctx, close: () => browser.close() };
  }
  const browser = process.env.CHROME_EXECUTABLE_PATH
    ? await chromium.launch({ executablePath: process.env.CHROME_EXECUTABLE_PATH, headless: process.env.HEADED !== "1" })
    : await chromium.launch({ args: sparticuz.args, executablePath: await sparticuz.executablePath(), headless: true });
  const ctx = await browser.newContext({ storageState, viewport: { width: 1280, height: 900 } });
  return { ctx, close: () => browser.close() };
}
