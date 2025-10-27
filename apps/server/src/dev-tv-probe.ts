import { BrowserPool } from "./infra/playwright/BrowserPool.js";
import { TradingViewPage } from "./infra/playwright/TradingViewPage.js";

async function main() {
  // robust: ignore ts file path, and any argv starting with '-'
  const args = process.argv
    .slice(2)
    .filter(a => a && !a.startsWith("-") && !a.endsWith(".ts"));

  const symbol = (args[0] ?? "BTCUSD").toUpperCase();
  console.info("[probe] args=", args, "→ symbol:", symbol);

  const pool = new BrowserPool();
  await pool.init();

  const tv = new TradingViewPage(pool, symbol);
  tv.onPriceUpdate(t =>
    console.log(`[tick] ${t.symbol} ${t.price} @ ${new Date(t.tsMs).toISOString()}`)
  );
  await tv.open();

  process.on("SIGINT", async () => {
    console.log("\n[dev] closing…");
    await tv.close();
    await pool.close();
    process.exit(0);
  });
}

main().catch(e => { console.error(e); process.exit(1); });
