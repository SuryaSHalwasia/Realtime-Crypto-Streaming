import type { PriceTick, SymbolStr } from "./types.js";

export interface PriceStreamHandle { close(): Promise<void>; }

export interface IPriceSource {
  start(symbol: SymbolStr, onTick: (t: PriceTick) => void): Promise<PriceStreamHandle>;
}
