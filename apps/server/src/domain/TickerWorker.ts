import { TradingViewPage } from "../infra/playwright/TradingViewPage.js";
import type { PriceTick } from "./types.js";
import { BrowserPool } from "../infra/playwright/BrowserPool.js";

const MIN_EMIT_MS = 120; // ~low-latency coalesce

export class TickerWorker {
  private tv?: TradingViewPage;
  private running = false;
  private lastEmit = 0;
  private queued: PriceTick | null = null;

  constructor(private pool: BrowserPool, private symbol: string) {}

  async start(onTick: (t: PriceTick) => void): Promise<void> {
    this.running = true;

    const emit = (t: PriceTick) => {
      const now = Date.now();
      if (now - this.lastEmit >= MIN_EMIT_MS) {
        this.lastEmit = now;
        onTick(t);
      } else {
        this.queued = t;
        setTimeout(() => {
          if (this.queued) {
            onTick(this.queued);
            this.lastEmit = Date.now();
            this.queued = null;
          }
        }, MIN_EMIT_MS);
      }
    };

    const boot = async () => {
      if (!this.running) return;
      this.tv = new TradingViewPage(this.pool, this.symbol);
      this.tv.onPriceUpdate(emit);
      this.tv.onClose(() => {
        if (this.running) {
          console.warn("[TickerWorker] restarting page for", this.symbol);
          boot().catch((e) => console.error("[TickerWorker] restart failed", e));
        }
      });
      await this.tv.open();
    };

    await boot();
  }

  async stop(): Promise<void> {
    this.running = false;
    await this.tv?.close();
  }
}
