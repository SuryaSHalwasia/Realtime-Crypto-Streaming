"use client";
import { useEffect, useRef, useState } from "react";
import { priceClient } from "./lib/client";
import { SubscribeRequest } from "@pluto/api";
import { ConnectError, Code } from "@connectrpc/connect";

export default function TickerProbe() {
  const [symbol, setSymbol] = useState("BTCUSD");
  const [price, setPrice] = useState<number | null>(null);
  const [status, setStatus] = useState<"idle" | "running" | "stopped" | "error">("idle");

  const ctrlRef = useRef<AbortController | null>(null);
  const runRef = useRef(0); // avoid races if Start is clicked twice

  function stop() {
    ctrlRef.current?.abort();
    ctrlRef.current = null;
    // don't set error — this is a normal user action
    setStatus("stopped");
  }

  async function start() {
    stop();
    runRef.current += 1;
    const run = runRef.current;

    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    setStatus("running");

    try {
      const req = new SubscribeRequest({ symbols: [symbol.trim().toUpperCase()] });
      for await (const tick of priceClient.subscribe(req, { signal: ctrl.signal })) {
        if (run !== runRef.current) break; // a newer run started
        setPrice(tick.price);
        console.log("[tick]", tick.symbol, tick.price, Number(tick.tsMs));
      }
    } catch (err) {
      // Swallow user-initiated cancellations
      const ce = ConnectError.from(err);
      if (ce.code === Code.Canceled) {
        // already set to "stopped" by stop()
        return;
      }
      console.error(err);
      setStatus("error");
    }
  }

  useEffect(() => () => stop(), []);

  return (
    <div style={{ display: "grid", gap: 12, maxWidth: 420 }}>
      <label>
        Ticker:{" "}
        <input
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          style={{ padding: 6, border: "1px solid #ccc", borderRadius: 6, width: 160 }}
        />
      </label>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={start}>Start</button>
        <button onClick={stop}>Stop</button>
      </div>
      <div>Latest: <strong>{price ?? "—"}</strong></div>
      <small>Status: {status}</small>
    </div>
  );
}
