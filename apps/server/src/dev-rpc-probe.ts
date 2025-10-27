import { createPromiseClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-node";
import { PriceService } from "@pluto/api/gen/proto/pluto/prices/v1/price_service_connect";
import { SubscribeRequest, PriceTick as PriceTickMsg } from "@pluto/api/gen/proto/pluto/prices/v1/price_service_pb";

async function main() {
  const raw = process.argv.slice(2);
  const args = raw.filter((a) => /^[A-Za-z0-9]{3,15}$/.test(a));
  const symbols = (args.length ? args : ["BTCUSD", "ETHUSD", "SOLUSD"]).map((s) => s.toUpperCase());

  const transport = createConnectTransport({ baseUrl: process.env.API_URL ?? "http://localhost:8080", httpVersion: "1.1" });
  const client = createPromiseClient(PriceService, transport);

  console.log("[probe] subscribing to", symbols);
  const req = new SubscribeRequest({ symbols });
  const stream = client.subscribe(req) as AsyncIterable<PriceTickMsg>;
  for await (const tick of stream) {
    console.log(`[tick] ${tick.symbol} ${tick.price} ${Number(tick.tsMs)}`);
  }
}
main().catch((e) => (console.error(e), process.exit(1)));