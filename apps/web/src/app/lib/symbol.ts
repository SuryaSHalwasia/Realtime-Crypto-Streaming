export const norm = (s: string) => s.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
export const looksLikeSymbol = (s: string) => /^[A-Z0-9]+(?:USD|USDT)$/.test(s);
