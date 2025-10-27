"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { startSymbolStream } from "../lib/stream";
import { fetchLastPrices } from "../lib/client";
import { norm, looksLikeSymbol } from "../lib/symbol";
import {
  loadSaved,
  saveSymbols,
  markRemoved,
  wasRecentlyRemoved,
  clearRemoved,
} from "../lib/persistence";

export type Row = {
  price: number | null;
  prev?: number | null;
  ts?: number; // time of last REAL streamed change
  history: number[];
  ac: AbortController;
  status?: "connecting" | "streaming" | "error";
  trend?: "up" | "down" | "flat";
};

const MAX_HISTORY = 40;
const EPS = 1e-6; // only treat moves > EPS as a real change

export function useTickers() {
  const [rows, setRows] = useState<Map<string, Row>>(() => new Map());
  const [error, setError] = useState("");
  const rowsRef = useRef(rows);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  // boot: restore saved + hydrate once (warm-only)
  useEffect(() => {
    const saved = loadSaved().map(norm).filter(looksLikeSymbol);
    saved.forEach((sym) => addSymbol(sym, true));

    (async () => {
      if (!saved.length) return;
      try {
        const ticks = await fetchLastPrices(saved);
        setRows((prev) => {
          const next = new Map(prev);
          if (Array.isArray(ticks)) {
            for (const t of ticks as Array<{ symbol: string; price: number | string }>) {
              const r = next.get(t.symbol);
              if (r && r.price == null) seed(r, Number(t.price), true);
            }
          } else if (ticks && typeof ticks === "object") {
            const m = ticks as Record<string, number | string>;
            for (const s of Object.keys(m)) {
              const r = next.get(s);
              if (r && r.price == null) seed(r, Number(m[s]), true);
            }
          }
          return next;
        });
      } catch (e) {
        console.info("[hydrate] fetchLastPrices failed", e);
      }
    })();

    const cleanup = () => rowsRef.current.forEach((r) => r.ac.abort());
    window.addEventListener("pagehide", cleanup);
    window.addEventListener("beforeunload", cleanup);
    return () => {
      window.removeEventListener("pagehide", cleanup);
      window.removeEventListener("beforeunload", cleanup);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // rAF coalescing for high tick rates
  const pending = useRef(new Map<string, { p: number; ts: number }>());
  const scheduled = useRef(false);

  const commit = () => {
    scheduled.current = false;
    setRows((prev) => {
      const next = new Map(prev);

      pending.current.forEach(({ p, ts }, sym) => {
        const r = next.get(sym);
        if (!r) return;
        if (r.ts && ts <= r.ts) return; // drop out-of-order

        const priceNow = r.price;
        const changed = priceNow == null ? true : Math.abs(p - priceNow) > EPS;

        // always extend history for chart
        const hist = (r.history || []).concat(p).slice(-MAX_HISTORY);

        if (!changed) {
          next.set(sym, { ...r, history: hist });
          return;
        }

        // compute trend + update row
        let trend: "up" | "down" | "flat" = r.trend ?? "flat";
        if (priceNow == null) trend = "flat";
        else if (p > priceNow) trend = "up";
        else if (p < priceNow) trend = "down";

        next.set(sym, {
          ...r,
          prev: r.price,
          price: p,
          ts, // time of REAL change
          history: hist,
          trend,
          status: "streaming",
        });
      });

      pending.current.clear();
      saveSymbols([...next.keys()]);
      return next;
    });
  };

  const enqueue = (sym: string, p: number, ts: number) => {
    pending.current.set(sym, { p, ts });
    if (!scheduled.current) {
      scheduled.current = true;
      requestAnimationFrame(commit);
    }
  };

  // helpers
  function seed(r: Row, p: number, warm = false) {
    r.price = p;
    r.prev = null;
    r.ts = warm ? undefined : Date.now(); // warm seed shows a number but doesn't start the "ago" clock
    r.history = Array.from({ length: MAX_HISTORY }, () => p);
    r.trend = "flat";
    if (!warm) r.status = "streaming";
  }

  // actions
  function addSymbol(raw: string, quiet = false) {
    const sym = norm(raw);
    if (!looksLikeSymbol(sym)) {
      if (!quiet) setError("Invalid symbol format");
      return;
    }
    if (rowsRef.current.has(sym)) {
      if (!quiet) setError("Already added");
      return;
    }
    setError("");

    const recentlyRemoved = wasRecentlyRemoved(sym);
    console.info("[ui] addSymbol", sym, recentlyRemoved ? "(recently removed: suppress warm)" : "");

    const ac = startSymbolStream(sym, (tick: any) => {
      const price = Number((tick as any).price ?? tick);
      const ts = (tick as any).ts ?? Date.now();
      enqueue(sym, price, ts);

      // mark streaming on first real tick
      setRows((prev) => {
        const row = prev.get(sym);
        if (!row || row.status === "streaming") return prev;
        const next = new Map(prev);
        next.set(sym, { ...row, status: "streaming" });
        return next;
      });

      // once we got a real tick, clear any tombstone (in case user added within TTL)
      clearRemoved(sym);
    });

    // insert row with "connecting"
    setRows((prev) => {
      const next = new Map(prev);
      next.set(sym, {
        price: null,
        prev: null,
        ts: undefined,
        history: [],
        ac,
        status: "connecting",
        trend: "flat",
      });
      saveSymbols([...next.keys()]);
      return next;
    });

    // watchdog: no tick in 5s -> error
    setTimeout(() => {
      setRows((prev) => {
        const row = prev.get(sym);
        if (!row || row.status === "streaming") return prev;
        const next = new Map(prev);
        next.set(sym, { ...row, status: "error" });
        return next;
      });
    }, 5000);

    // hydrate so a number shows before first tick (skip if recently removed)
    (async () => {
      try {
        if (recentlyRemoved) return; // suppress warm seed for ~30s after remove
        const r = await fetchLastPrices([sym]);
        const p = Array.isArray(r) ? Number(r[0]?.price) : Number((r as any)[sym]);
        if (Number.isFinite(p)) {
          setRows((prev) => {
            const next = new Map(prev);
            const row = next.get(sym);
            if (row && row.price == null) {
              seed(row, p, true); // warm only: no ts, no status flip
            }
            return next;
          });
        }
      } catch {
        /* ignore */
      }
    })();
  }

  function removeSymbol(sym: string) {
    const row = rowsRef.current.get(sym);
    if (row) row.ac.abort();

    setRows((prev) => {
      const next = new Map(prev);
      next.delete(sym);
      markRemoved(sym);                 // start 30s TTL from removal time
      saveSymbols([...next.keys()]);
      return next;
    });
  }

  // selectors
  const symbols = useMemo(() => [...rows.keys()].sort(), [rows]);

  return { rows, symbols, error, setError, addSymbol, removeSymbol };
}
