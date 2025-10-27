// Normalize & map the user ticker to a TradingView BINANCE symbol for navigation.
export function normalizeTicker(input: string): string {
  return input.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * BINANCE quotes most pairs in USDT, not USD.
 * Map *USD -> *USDT for the page URL ONLY.
 * We still emit the original symbol back to clients.
 */
export function mapToBinanceSymbolForNavigation(ticker: string): string {
  const sym = normalizeTicker(ticker);
  return sym.endsWith("USD") && !sym.endsWith("USDT")
    ? sym.slice(0, -3) + "USDT"
    : sym;
}
