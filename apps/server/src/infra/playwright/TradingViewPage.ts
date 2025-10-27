import type { Page } from "playwright";
import type { PriceTick } from "../../domain/types.js";
import { BrowserPool } from "./BrowserPool.js";
import { mapToBinanceSymbolForNavigation } from "../../domain/symbols.js";

const MIN_EMIT_MS = 120; // ⬅️ CPE window (~100–200ms is good)

export class TradingViewPage {
  private page?: Page;
  private onPrice?: (tick: PriceTick) => void;
  private onClosed?: () => void;

  // ---- CPE state
  private lastEmit = 0;
  private lastSentPrice: number | null = null;
  private queued: PriceTick | null = null;
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(private pool: BrowserPool, private symbol: string) {}

  onPriceUpdate(cb: (tick: PriceTick) => void) {
    this.onPrice = cb;
  }

  /** Optional: caller can subscribe to page close/crash to auto-restart. */
  onClose(cb: () => void) {
    this.onClosed = cb;
  }

  // ---- Coalesced Price Emitter (CPE)
  private emitCoalesced(t: PriceTick) {
    const now = Date.now();

    // Drop exact-duplicate prices to avoid no-op churn
    if (this.lastSentPrice !== null && t.price === this.lastSentPrice) {
      this.lastEmit = now; // keep freshness so we don't immediately flush a dup
      return;
    }

    const elapsed = now - this.lastEmit;
    if (elapsed >= MIN_EMIT_MS) {
      this.lastEmit = now;
      this.lastSentPrice = t.price;
      this.onPrice?.(t);
      // clear any pending flush
      if (this.flushTimer) { clearTimeout(this.flushTimer); this.flushTimer = null; }
      this.queued = null;
      return;
    }

    // coalesce within the window — keep only the most recent tick
    this.queued = t;
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null;
        if (!this.queued) return;
        const q = this.queued; this.queued = null;
        this.lastEmit = Date.now();
        this.lastSentPrice = q.price;
        this.onPrice?.(q);
      }, MIN_EMIT_MS - elapsed);
    }
  }

  async open(): Promise<void> {
    this.page = await this.pool.newPage();

    // Helpful diagnostics
    this.page.on("close", () => {
      console.warn("[page] closed:", this.symbol);
      this.onClosed?.();
    });
    this.page.on("crash", () => {
      console.error("[page] crashed:", this.symbol);
      this.onClosed?.();
    });

    // 1) Expose Node callback first (so page code can push immediately)
    await this.page.exposeFunction("nodePricePush", (priceText: string) => {
      const cleaned = priceText.replace(/[,\s]/g, "");
      const price = Number(cleaned);

      // Heuristics to avoid false positives like "15" (timeframe buttons)
      const looksValid =
        Number.isFinite(price) &&
        (/\b\d{3,}\b/.test(cleaned) || /\d+\.\d{2,}/.test(cleaned)) &&
        price >= 10;

      if (!looksValid) return;

      // ⬇️ Route through CPE
      this.emitCoalesced({
        symbol: this.symbol, // keep original symbol for the outside world
        exchange: "BINANCE",
        price,
        tsMs: Date.now(),
      });
    });

    // 2) Install a PURE JS init script (no TS/modern syntax to avoid bundler helpers)
    await this.page.addInitScript({
      content: `
        (function () {
          function isVisible(el) {
            var s = window.getComputedStyle(el);
            var r = el.getBoundingClientRect();
            return s.visibility !== "hidden" && s.display !== "none" && r.width > 0 && r.height > 0;
          }
          function isPriceyText(txt) {
            // >=3 digits OR decimal with >=2 places (e.g., 25345.12 or 0.1234)
            return /\\b(?:\\d{3,}(?:,\\d{3})*(?:\\.\\d+)?|\\d+\\.\\d{2,})\\b/.test(txt);
          }
          function asNumber(txt) {
            return Number(String(txt || "").replace(/[\\s,]/g, ""));
          }
          function pickLikelyPriceElement() {
            var set = new Set();
            var sels = [
              '[data-name="price"]',
              '[class*="lastPrice"] span',
              '[class*="price"] span',
              'span[class*="Price"]',
              'div[data-symbol-title] ~ div span',
              'div[data-interval] span'
            ];
            for (var i = 0; i < sels.length; i++) {
              var list = document.querySelectorAll(sels[i]);
              for (var j = 0; j < list.length; j++) set.add(list[j]);
            }
            var spans = document.querySelectorAll("span");
            for (var k = 0; k < spans.length; k++) set.add(spans[k]);

            var best = null;
            var bestFont = 0;
            set.forEach(function (el) {
              if (!(el instanceof HTMLElement)) return;
              var txt = el.textContent || "";
              if (!isVisible(el) || !isPriceyText(txt)) return;

              var val = asNumber(txt);
              if (!isFinite(val) || val < 10) return;

              var font = parseFloat(getComputedStyle(el).fontSize || "0");
              if (font > bestFont) { bestFont = font; best = el; }
            });
            return best;
          }

          function attach(toEl) {
            if (!toEl) return null;
            try { toEl.style.outline = "2px dashed rgba(0,128,255,0.35)"; } catch (e) {}

            var push = function (txt) { if (window.nodePricePush) window.nodePricePush(txt); };
            push(toEl.textContent || "");

            var currentEl = toEl;

            var obs = new MutationObserver(function () {
              // If DOM shuffles, re-pick the best price node
              var picked = pickLikelyPriceElement();
              if (picked && picked !== currentEl) {
                try { currentEl.style.outline = ""; } catch (e) {}
                currentEl = picked;
                try { currentEl.style.outline = "2px dashed rgba(0,128,255,0.35)"; } catch (e) {}
                push(currentEl.textContent || "");
                return;
              }
              var txt = currentEl.textContent || "";
              if (/\\d/.test(txt)) push(txt);
            });

            obs.observe(document.body, { subtree: true, characterData: true, childList: true });
            return obs;
          }

          // Define once; we trigger this after navigation
          window.__tv_attachObserver = function () {
            var tries = 0;
            var tick = function () {
              var el = pickLikelyPriceElement();
              if (el) {
                var obs = attach(el);
                if (window.__tv_obs && window.__tv_obs.disconnect) window.__tv_obs.disconnect();
                window.__tv_obs = obs;
                console.log("Price observer attached");
                return;
              }
              tries++;
              if (tries <= 80) setTimeout(tick, 250); // retry ~20s
              else console.warn("Price node not found after retries");
            };
            tick();
          };
        })();
      `,
    });

    // 3) Navigate AFTER init script is in place
    const navSym = mapToBinanceSymbolForNavigation(this.symbol);
    const url = `https://www.tradingview.com/symbols/${navSym}/?exchange=BINANCE`;
    if (navSym !== this.symbol) {
      console.info(`[TV] mapping ${this.symbol} -> ${navSym} for BINANCE navigation`);
    }

    await this.page.goto(url, { waitUntil: "domcontentloaded" });
    if (this.page.isClosed()) throw new Error("Page closed during navigation");
    console.info(`[TV] opened ${url}`);

    // Dismiss common overlays (best effort)
    try {
      await this.page.evaluate(() => {
        try {
          const oneTap = document.getElementById("credential_picker_container");
          oneTap?.remove();
          document.querySelectorAll('[aria-label="Close"], [data-name="close"]').forEach((el) => {
            (el as HTMLElement).click?.();
          });
        } catch {}
      });
    } catch {}

    if (this.page.isClosed()) throw new Error("Page closed before attaching observer");

    // 4) Attach observer in the loaded doc (retries inside page)
    await this.page.evaluate(() => (window as any).__tv_attachObserver?.());
  }

  async close(): Promise<void> {
    if (this.page) {
      try {
        await this.page.context().close(); // closes page + context
      } finally {
        this.page = undefined;
      }
    }
  }
}
