import type { ConnectRouter } from "@connectrpc/connect";
import { PriceService } from "@pluto/api/gen/proto/pluto/prices/v1/price_service_connect";
import {
  PriceTick as PriceTickMsg,
  SubscribeRequest,
  GetLastPricesRequest,
  GetLastPricesResponse,
} from "@pluto/api/gen/proto/pluto/prices/v1/price_service_pb";
import { PriceHub } from "../domain/PriceHub.js";

export function routes(router: ConnectRouter, hub: PriceHub) {
  // Concrete handler shapes (avoid ServiceImpl generics to dodge type identity issues)
  type SubscribeImpl = (req: SubscribeRequest, ctx: { signal: AbortSignal }) => AsyncIterable<PriceTickMsg>;
  type GetLastImpl   = (req: GetLastPricesRequest) => Promise<GetLastPricesResponse>;

  const MAX_QUEUE = 1000;
  const norm = (s: string) => s.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const isSymbol = (s: string) => /^[A-Z0-9]+(?:USD|USDT)$/.test(s);

  // --- subscribe (server-streaming) ---
  const subscribe: SubscribeImpl = (async function* (req, ctx) {
    let symbol = norm(req.symbols?.[0] ?? "BTCUSD");
    if (!isSymbol(symbol)) {
      console.warn("[subscribe] invalid symbol:", req.symbols?.[0], "→ BTCUSD");
      symbol = "BTCUSD";
    }
    console.info("[subscribe] start →", symbol);

    // queue with simple backpressure cap
    const queue: PriceTickMsg[] = [];
    let resolver: ((m: PriceTickMsg) => void) | null = null;
    const push = (m: PriceTickMsg) => {
      if (resolver) {
        const f = resolver; resolver = null; f(m);
      } else {
        if (queue.length >= MAX_QUEUE) queue.shift();
        queue.push(m);
      }
    };

    let unsubscribe: (() => Promise<void>) | null = null;
    try {
      unsubscribe = await hub.subscribe(symbol, (t) => {
        push(new PriceTickMsg({
          symbol: t.symbol,
          exchange: t.exchange,
          price: t.price,
          tsMs: BigInt(t.tsMs),
        }));
      });

      const warm = hub.getMany([symbol]);
      if (warm[0]) {
        console.info("[subscribe] warm tick →", warm[0].symbol, warm[0].price);
        push(new PriceTickMsg({
          symbol: warm[0].symbol,
          exchange: warm[0].exchange,
          price: warm[0].price,
          tsMs: BigInt(warm[0].tsMs),
        }));
      }
    } catch (e) {
      console.error("[subscribe] failed to start hub for", symbol, e);
      throw e;
    }

    const aborted = new Promise<never>((_, rej) =>
      ctx.signal.addEventListener("abort", () => rej(new Error("client aborted")), { once: true }),
    );

    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const next =
          queue.length > 0
            ? queue.shift()!
            : await Promise.race([
                new Promise<PriceTickMsg>((res) => (resolver = res)),
                aborted,
              ]);
        yield next;
      }
    } finally {
      try { await unsubscribe?.(); } finally { console.info("[subscribe] stop ←", symbol); }
    }
  }) as SubscribeImpl;

  // --- getLastPrices (unary) ---
  const getLastPrices: GetLastImpl = async (req) => {
    const symbols = Array.from(new Set((req.symbols ?? []).map(norm).filter(isSymbol)));

    console.info("[getLastPrices] req →", symbols.join(",") || "(empty)");
    const hits = hub.getMany(symbols);
    console.info(
      "[getLastPrices] hit →",
      hits.length ? hits.map((t) => `${t.symbol}:${t.price}`).join(",") : "(none)",
    );

    const ticks = hits.map((t) =>
      new PriceTickMsg({
        symbol: t.symbol,
        exchange: t.exchange,
        price: t.price,
        tsMs: BigInt(t.tsMs),
      }),
    );

    return new GetLastPricesResponse({ ticks });
  };

  // Register service — cast to any to avoid generic type identity churn
  router.service(PriceService as any, {
    subscribe: subscribe as any,
    getLastPrices: getLastPrices as any,
  } as any);
}
