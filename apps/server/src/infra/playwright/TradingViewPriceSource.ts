import type { IPriceSource, PriceStreamHandle } from "../../domain/IPriceSource.js";
import type { PriceTick, SymbolStr } from "../../domain/types.js";
import { BrowserPool } from "./BrowserPool.js";
import { TradingViewPage } from "./TradingViewPage.js";
import { mapToBinanceSymbolForNavigation } from "../../domain/symbols.js";

export class TradingViewPriceSource implements IPriceSource {
  constructor(private pool: BrowserPool) {}

  async start(symbol: SymbolStr, onTick: (t: PriceTick) => void): Promise<PriceStreamHandle> {
    // ensure Chromium is up (idempotent)
    await this.pool.init();

    // TV expects most USD pairs as USDT on BINANCE
    const tvSymbol = mapToBinanceSymbolForNavigation(symbol);

    const page = new TradingViewPage(this.pool, tvSymbol);
    // normalize back to the *requested* symbol on the way out
    page.onPriceUpdate((t) =>
      onTick({ symbol, exchange: "BINANCE", price: t.price, tsMs: t.tsMs }),
    );

    await page.open();
    return { close: async () => page.close() };
  }
}
