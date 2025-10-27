const STORAGE_KEY = "pluto:tickers";
const PIN_KEY = "pluto:pins";

// 30s tombstone for removed symbols
const REMOVED_KEY = "pluto:removed@v1";
const REMOVED_TTL_MS = 30_000;

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, val: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {}
}

function cleanupRemoved(): Record<string, number> {
  const removed = readJSON<Record<string, number>>(REMOVED_KEY, {});
  const now = Date.now();
  let dirty = false;
  for (const [sym, until] of Object.entries(removed)) {
    if (!until || until <= now) {
      delete removed[sym];
      dirty = true;
    }
  }
  if (dirty) writeJSON(REMOVED_KEY, removed);
  return removed;
}

/** Load saved tickers, hiding any that were removed in the last 30s. */
export function loadSaved(): string[] {
  const symbols = readJSON<string[]>(STORAGE_KEY, []);
  const removed = cleanupRemoved();
  const now = Date.now();
  return symbols.filter((s) => !(removed[s] && removed[s] > now));
}

/** Save current tickers. If a user re-added one within TTL, clear its tombstone. */
export function saveSymbols(symbols: string[]) {
  writeJSON(STORAGE_KEY, symbols);
  const removed = cleanupRemoved();
  let dirty = false;
  for (const s of symbols) {
    if (removed[s]) {
      delete removed[s];
      dirty = true;
    }
  }
  if (dirty) writeJSON(REMOVED_KEY, removed);
}

export function loadPins(): Record<string, boolean> {
  return readJSON<Record<string, boolean>>(PIN_KEY, {});
}
export function savePins(pins: Record<string, boolean>) {
  writeJSON(PIN_KEY, pins);
}

/** Mark a symbol removed; keeps it suppressed for ~30s across reloads. */
export function markRemoved(symbol: string) {
  const removed = cleanupRemoved();
  removed[symbol] = Date.now() + REMOVED_TTL_MS;
  writeJSON(REMOVED_KEY, removed);
}

/** True if this symbol was removed in the last 30s. */
export function wasRecentlyRemoved(symbol: string): boolean {
  try {
    const map = readJSON<Record<string, number>>(REMOVED_KEY, {});
    const until = map[symbol];
    return typeof until === "number" && until > Date.now();
  } catch {
    return false;
  }
}

/** Clear a tombstone explicitly (used after successful re-add). */
export function clearRemoved(symbol: string) {
  const removed = cleanupRemoved();
  if (removed[symbol]) {
    delete removed[symbol];
    writeJSON(REMOVED_KEY, removed);
  }
}
