"use client";
import TickerCard from "./TickerCard";
import type { Row } from "../../hooks/useTickers";

export default function TickerGrid({
  symbols, rows, onRemove,
}: { symbols: string[]; rows: Map<string, Row>; onRemove: (s: string) => void; }) {
  if (symbols.length === 0) return <div className="text-gray-500">Add a symbol to start streaming.</div>;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {symbols.map((sym) => <TickerCard key={sym} symbol={sym} row={rows.get(sym)!} onRemove={onRemove} />)}
    </div>
  );
}
