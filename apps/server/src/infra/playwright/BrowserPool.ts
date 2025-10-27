import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

export class BrowserPool {
  private browser?: Browser;

  async init(): Promise<void> {
    if (this.browser) return;
    this.browser = await chromium.launch({ headless: false }); // headed per spec
    console.info("[BrowserPool] Chromium launched (headed)");
  }

  async newContext(): Promise<BrowserContext> {
    if (!this.browser) throw new Error("Browser not initialized");
    return await this.browser.newContext({
      viewport: { width: 1024, height: 768 },
      userAgent:
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari"
    });
  }

  async newPage(): Promise<Page> {
    const ctx = await this.newContext();
    const page = await ctx.newPage();

    page.on("console", (msg) => console.log(`[page:${page.url()}] ${msg.type()}:`, msg.text()));
    page.on("pageerror", (err) => console.error("[page error]", err));

    const mode = (process.env.TV_WINDOW_MODE ?? "normal").toLowerCase();
    try {
      if (mode === "minimized") {
        const cdp = await page.context().newCDPSession(page);
        const { windowId } = await cdp.send("Browser.getWindowForTarget");
        await cdp.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "minimized" } });
      } else if (mode === "offscreen") {
        // move window off visible area; still headed
        await page.context().newCDPSession(page).then(async (cdp) => {
          const { windowId } = await cdp.send("Browser.getWindowForTarget");
          await cdp.send("Browser.setWindowBounds", {
            windowId,
            bounds: { left: -10000, top: -10000, width: 800, height: 600, windowState: "normal" },
          });
        });
      }
    } catch (e) {
      console.warn("[BrowserPool] window minimize/offscreen failed:", e);
    }

    return page;
  }


  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = undefined;
      console.info("[BrowserPool] Chromium closed");
    }
  }
}
