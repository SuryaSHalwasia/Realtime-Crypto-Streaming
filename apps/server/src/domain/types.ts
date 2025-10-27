export type SymbolStr = string;

export interface PriceTick {
  symbol: SymbolStr;
  exchange: "BINANCE";
  price: number;
  tsMs: number;
}
