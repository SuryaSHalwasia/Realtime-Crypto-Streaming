"use client";
import { useState } from "react";
import { useTickers } from "../hooks/useTickers";
import TickerGrid from "./ticker/TickerGrid";

export default function TickerBoard() {
  const { rows, symbols, error, setError, addSymbol, removeSymbol } = useTickers();
  const [input, setInput] = useState("");

  const onAdd = () => {
    if (!input) return;
    addSymbol(input);
    setInput("");
  };

  return (
    <div className="mx-auto max-w-6xl p-6 space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Pluto — Live Prices</h1>
        </div>
        {symbols.length > 0 && (
          <button onClick={() => symbols.forEach(removeSymbol)} className="text-sm px-3 py-1.5 rounded border hover:bg-gray-50">
            Clear All
          </button>
        )}
      </header>

      <div className="flex gap-3 mb-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") onAdd(); }}
          placeholder="Add ticker (e.g. BTCUSDT, ETHUSD)"
          className="flex-1 border rounded px-3 py-2"
        />
        <button onClick={onAdd} className="px-4 py-2 rounded border hover:bg-gray-50">Add</button>
      </div>
      {error && <div className="text-sm text-red-600">{error}</div>}

      <TickerGrid symbols={symbols} rows={rows} onRemove={removeSymbol} />
    </div>
  );
}
