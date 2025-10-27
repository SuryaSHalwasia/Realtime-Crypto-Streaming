"use client";
import { useEffect, useState } from "react";
import Sparkline from "./Sparkline";
import { fmtPrice, fmtDelta, ago } from "../../lib/format";
import type { Row } from "../../hooks/useTickers";

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let id: any;
    const tick = () => setNow(Date.now());
    const start = () => { id = setInterval(tick, intervalMs); };
    const stop = () => { if (id) clearInterval(id); };
    const vis = () => (document.visibilityState === "visible" ? start() : stop());
    start();
    document.addEventListener("visibilitychange", vis);
    return () => { stop(); document.removeEventListener("visibilitychange", vis); };
  }, [intervalMs]);
  return now;
}

export default function TickerCard({
  symbol, row, onRemove,
}: { symbol: string; row: Row; onRemove: (s: string) => void; }) {
  // Numeric delta & percentage text (adaptive precision)
  const { text: dText, pctText } = fmtDelta(row.price, row.prev);

  // Color/arrow from persisted trend so color doesn't flip on the 1s timer
  const trendUp = row.trend === "up";
  const trendDown = row.trend === "down";

  const now = useNow(1000);

  return (
    <div className="rounded-2xl border shadow-sm p-4 bg-white">
      <div className="flex items-center justify-between mb-1">
        <div className="font-semibold tracking-wide text-lg">{symbol}</div>
        <div className={`text-xs px-2 py-1 rounded-full border ${trendUp ? "border-green-600 text-green-700" : trendDown ? "border-red-600 text-red-700" : "border-gray-300 text-gray-600"}`}>
          {trendUp ? "▲" : trendDown ? "▼" : "•"} {dText}{pctText ? ` (${pctText})` : ""}
        </div>
      </div>

      <div className={`text-3xl font-semibold tabular-nums ${trendUp ? "text-green-600" : trendDown ? "text-red-600" : "text-gray-900"}`}>
        {fmtPrice(row.price)}
      </div>

      <div className="mt-3">
        <Sparkline data={row.history} up={trendUp} down={trendDown} />
      </div>

      <div className="flex items-center justify-between mt-3 text-sm text-gray-600">
        <div>{ago(row.ts, now)}</div>
        <button onClick={() => onRemove(symbol)} className="px-3 py-1 rounded border hover:bg-gray-50">Remove</button>
      </div>
    </div>
  );
}
