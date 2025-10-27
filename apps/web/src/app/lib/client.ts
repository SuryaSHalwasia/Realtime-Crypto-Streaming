import { createPromiseClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import type { ServiceType } from "@bufbuild/protobuf";
import { PriceService as PriceDesc } from "@pluto/api";
import {
  PriceTickMsg,
  SubscribeRequest,
  GetLastPricesRequest,
  GetLastPricesResponse,
} from "@pluto/api";

const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
const transport = createConnectTransport({ baseUrl });

export type PriceClient = {
  subscribe(
    req: SubscribeRequest,
    opts?: { signal?: AbortSignal }
  ): AsyncIterable<PriceTickMsg>;

  getLastPrices(
    req: GetLastPricesRequest,
    opts?: { signal?: AbortSignal }
  ): Promise<GetLastPricesResponse>;
};

export const priceClient = createPromiseClient(
  PriceDesc as unknown as ServiceType,
  transport
) as unknown as PriceClient;

/** Convenience helper for the UI */
export async function fetchLastPrices(symbols: string[]) {
  if (symbols.length === 0) return [];
  const res = await priceClient.getLastPrices(
    new GetLastPricesRequest({ symbols })
  );
  return res.ticks;
}
