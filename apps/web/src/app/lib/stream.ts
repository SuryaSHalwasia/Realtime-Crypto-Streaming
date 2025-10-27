"use client";

import { priceClient } from "./client";
import { SubscribeRequest, PriceTickMsg as PriceTick } from "@pluto/api";
import { ConnectError, Code } from "@connectrpc/connect";

/** Sleep with abort support. */
function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    };
    if (signal) signal.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Start a single-symbol server-stream. Returns an AbortController to stop.
 * - Auto-reconnects with exponential backoff (max 10s) unless canceled.
 * - Safe to call from React Strict Mode mount/unmount cycles; just keep the
 *   returned controller and call .abort() on real unmount.
 */
export function startSymbolStream(
  symbol: string,
  onTick: (t: PriceTick) => void,
): AbortController {
  const ac = new AbortController();

  (async () => {
    let attempt = 0;

    while (!ac.signal.aborted) {
      try {
        const req = new SubscribeRequest({ symbols: [symbol] });
        // Reset attempt on successful connect
        attempt = 0;

        for await (const tick of priceClient.subscribe(req, { signal: ac.signal })) {
          onTick(tick);
          // Optional debug:
          // console.debug("[tick]", tick.symbol, tick.price, Number(tick.tsMs));
        }

        // If the loop ends without error and not aborted, break (server ended stream).
        if (!ac.signal.aborted) break;
      } catch (err) {
        const ce = ConnectError.from(err);
        if (ce.code === Code.Canceled || ac.signal.aborted) {
          // Explicit user cancel or navigation — stop trying.
          break;
        }

        // Backoff with jitter (300ms * 2^attempt, cap 10s)
        attempt += 1;
        const cap = 10_000;
        const base = 300 * Math.pow(2, Math.min(attempt, 6));
        const delay = Math.min(cap, base) + Math.floor(Math.random() * 400);

        // Optional log:
        // console.warn(`[stream:${symbol}] reconnect in ${delay}ms`, ce.message);

        try {
          await sleep(delay, ac.signal);
        } catch {
          // aborted during backoff
          break;
        }
      }
    }
  })();

  return ac;
}
