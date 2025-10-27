export const fmtPrice = (price: number | null) =>
  price == null || Number.isNaN(price)
    ? "—"
    : price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Adaptive precision: show more decimals for tiny moves */
export function fmtDelta(price?: number | null, prev?: number | null) {
  if (price == null || prev == null) return { text: "—", up: false, down: false, pct: null as number | null };

  const d = price - prev;
  const ad = Math.abs(d);

  // choose precision dynamically
  let frac = 2;
  if (ad > 0 && ad < 1) frac = 4;
  if (ad > 0 && ad < 0.01) frac = 6;

  const pct = prev !== 0 ? (d / prev) * 100 : 0;

  return {
    text: d.toLocaleString(undefined, { minimumFractionDigits: frac, maximumFractionDigits: frac }),
    up: d > 0,
    down: d < 0,
    // pct: keep 4 decimals so 0.00% doesn’t mask tiny moves
    pct: Number.isFinite(pct) ? Number(pct) : null,
    pctText:
      Number.isFinite(pct)
        ? `${pct.toFixed(Math.abs(pct) < 0.01 ? 4 : 2)}%`
        : null,
  };
}

// 1-second "ago"
export const ago = (ts?: number, now: number = Date.now()) =>
  ts ? `${Math.max(0, Math.floor((now - ts) / 1000))}s ago` : "";
