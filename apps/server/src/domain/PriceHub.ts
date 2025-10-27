import type { PriceTick } from "./types.js";
import { TickerWorker } from "./TickerWorker.js";
import { BrowserPool } from "../infra/playwright/BrowserPool.js";
import { ConnectError, Code } from "@connectrpc/connect";

export type Unsubscribe = () => Promise<void>;

const MAX_PAGES = 10;
const LAST_TTL_MS = 30_000; // 30 seconds

type Entry = {
  worker: TickerWorker;
  subs: Set<(t: PriceTick) => void>;
  last?: PriceTick;
};

export class PriceHub {
  constructor(private readonly pool: BrowserPool) {}

  private symbols = new Map<string, Entry>();
  private lastCache = new Map<string, { tick: PriceTick; at: number }>();
  private closed = false;

  async subscribe(symbol: string, onTick: (t: PriceTick) => void): Promise<Unsubscribe> {
    if (this.closed) throw new Error("HubClosed: refusing new subscriptions during shutdown");

    let entry = this.symbols.get(symbol);
    if (!entry) {
      if (this.symbols.size >= MAX_PAGES) {
        throw new ConnectError("too many active symbols (max 20)", Code.ResourceExhausted);
      }
      entry = { worker: new TickerWorker(this.pool, symbol), subs: new Set() };
      this.symbols.set(symbol, entry);

      await this.pool.init(); // idempotent
      await entry.worker.start((t) => {
        const cur = this.symbols.get(symbol);
        if (!cur) return;
        cur.last = t;
        this.lastCache.set(symbol, { tick: t, at: Date.now() });
        for (const cb of cur.subs) cb(t);
      });
    }

    entry.subs.add(onTick);

    return async () => {
      const cur = this.symbols.get(symbol);
      if (!cur) return;
      cur.subs.delete(onTick);
      if (cur.subs.size === 0) {
        await cur.worker.stop();
        this.symbols.delete(symbol);
        // NOTE: we keep lastCache — that’s what allows prefill after page reload.
      }
    };
  }

  /** Latest known ticks (live or cached) within TTL; missing symbols omitted. */
  getMany(symbols: string[], ttlMs = LAST_TTL_MS): PriceTick[] {
    const now = Date.now();
    const out: PriceTick[] = [];
    for (const s of symbols) {
      const live = this.symbols.get(s)?.last;
      if (live) { out.push(live); continue; }
      const cached = this.lastCache.get(s);
      if (cached && now - cached.at <= ttlMs) out.push(cached.tick);
    }
    return out;
  }

  async shutdown(): Promise<void> {
    if (this.closed) return;
    this.closed = true;

    const entries = Array.from(this.symbols.values());
    this.symbols.clear();
    for (const { worker } of entries) {
      try { await worker.stop(); } catch (err) { console.warn("[PriceHub] worker stop failed:", err); }
    }
    try { await this.pool.close(); } catch (err) { console.warn("[PriceHub] pool.close() failed:", err); }
  }
}
